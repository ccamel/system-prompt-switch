import * as fs from "node:fs";
import * as path from "node:path";
import { detectHost, resolveHostPaths } from "../core/paths";
import { resolveScope } from "../core/prompt-scope-label";
import type { HostPlatform } from "../core/types/host-platform.type";
import type { SessionPromptConfig } from "../core/types/session-prompt-config.type";
import type { SessionStatePort } from "../ports/session-state.port";

export interface SessionEntryProvider {
	getSessionId?(): string;
	getEntries?(): readonly unknown[];
}

export type AppendEntryFn = (customType: string, data?: unknown) => void;

export class SessionStateAdapter implements SessionStatePort {
	private readonly memoryCache = new Map<string, SessionPromptConfig>();
	private readonly stateFilePath: string;
	private readonly host: HostPlatform;
	private appendEntryFn: AppendEntryFn | null = null;
	private entryProvider: SessionEntryProvider | null = null;

	constructor(customStatePath?: string) {
		this.stateFilePath = customStatePath ?? resolveHostPaths().statePath;
		this.host = detectHost();
	}

	setAppendEntryFn(fn: AppendEntryFn): void {
		this.appendEntryFn = fn;
	}

	setEntryProvider(provider: SessionEntryProvider): void {
		this.entryProvider = provider;
	}

	private readAllPersisted(): Record<string, SessionPromptConfig> {
		try {
			if (!fs.existsSync(this.stateFilePath)) return {};
			const raw = fs.readFileSync(this.stateFilePath, "utf-8");
			const all = JSON.parse(raw) as Record<string, SessionPromptConfig>;
			return this.migrateLegacyScopes(all);
		} catch {
			return {};
		}
	}

	/** Rewrite bare "global" scopes on one config, in place. */
	private migrateConfigScopes(config: SessionPromptConfig): SessionPromptConfig {
		if (!config || typeof config !== "object") return config;

		config.scope = resolveScope(config.scope, this.host);
		if (Array.isArray(config.activePrompts)) {
			for (const ref of config.activePrompts) {
				ref.scope = resolveScope(ref.scope, this.host);
			}
		}
		return config;
	}

	/**
	 * Older sessions stored a bare "global" scope meaning "whatever host we
	 * detected". Scopes are host-explicit now, so rewrite those entries to the
	 * detected host and persist the file once, leaving no ambiguous value behind.
	 */
	private migrateLegacyScopes(
		all: Record<string, SessionPromptConfig>,
	): Record<string, SessionPromptConfig> {
		const before = JSON.stringify(all);
		for (const [key, config] of Object.entries(all)) {
			all[key] = this.migrateConfigScopes(config);
		}
		if (JSON.stringify(all) !== before) {
			this.writeAllPersisted(all);
		}
		return all;
	}

	private writeAllPersisted(all: Record<string, SessionPromptConfig>): void {
		try {
			fs.mkdirSync(path.dirname(this.stateFilePath), { recursive: true });
			fs.writeFileSync(this.stateFilePath, JSON.stringify(all, null, 2), "utf-8");
		} catch {
			// best effort persistence
		}
	}

	async getSessionConfig(sessionId: string): Promise<SessionPromptConfig | null> {
		const key = sessionId || "default";

		// 1. In-memory cache
		if (this.memoryCache.has(key)) {
			return this.memoryCache.get(key)!;
		}

		// 2. Scan session manager entries if available
		if (this.entryProvider?.getEntries) {
			try {
				const entries = this.entryProvider.getEntries();
				for (let i = entries.length - 1; i >= 0; i--) {
					const entry = entries[i];
					if (
						entry &&
						typeof entry === "object" &&
						"customType" in entry &&
						entry.customType === "system-prompt-switch" &&
						"data" in entry &&
						entry.data &&
						typeof entry.data === "object"
					) {
						const config = this.migrateConfigScopes(
							entry.data as SessionPromptConfig,
						);
						this.memoryCache.set(key, config);
						return config;
					}
				}
			} catch {
				// fallback to persisted file
			}
		}

		// 3. Persisted sessions.json file
		const persisted = this.readAllPersisted();
		if (persisted[key]) {
			this.memoryCache.set(key, persisted[key]);
			return persisted[key];
		}

		return null;
	}

	async setSessionConfig(
		sessionId: string,
		config: SessionPromptConfig,
	): Promise<void> {
		const key = sessionId || "default";

		// Update in-memory cache
		this.memoryCache.set(key, config);

		// Append entry into Pi session JSONL
		if (this.appendEntryFn) {
			try {
				this.appendEntryFn("system-prompt-switch", config);
			} catch {
				// best effort
			}
		}

		// Persist to sessions.json indexed by sessionId
		const all = this.readAllPersisted();
		all[key] = config;
		this.writeAllPersisted(all);
	}
}
