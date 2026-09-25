import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveHostPaths } from "../core/paths";
import type { SessionPromptConfig } from "../core/types/session-prompt-config.type";
import type { SessionStatePort } from "../ports/session-state.port";

export interface SessionEntryProvider {
	getSessionId?(): string;
	getEntries?(): Array<{ customType?: string; data?: unknown }>;
}

export type AppendEntryFn = (customType: string, data?: unknown) => void;

export class SessionStateAdapter implements SessionStatePort {
	private readonly memoryCache = new Map<string, SessionPromptConfig>();
	private readonly stateFilePath: string;
	private appendEntryFn: AppendEntryFn | null = null;
	private entryProvider: SessionEntryProvider | null = null;

	constructor(customStatePath?: string) {
		this.stateFilePath = customStatePath ?? resolveHostPaths().statePath;
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
			return JSON.parse(raw) as Record<string, SessionPromptConfig>;
		} catch {
			return {};
		}
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
						entry.customType === "system-prompt-switch" &&
						entry.data &&
						typeof entry.data === "object"
					) {
						const config = entry.data as SessionPromptConfig;
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
