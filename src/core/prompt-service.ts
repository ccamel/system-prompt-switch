import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { buildSystemPrompt } from "./prompt-builder";
import type { ActivePromptRef } from "./types/active-prompt-ref.type";
import type {
	BuildPromptInput,
	CustomPromptChunk,
} from "./types/build-prompt-input.type";
import type { MergeMode } from "./types/merge-mode.type";
import type { PromptScope } from "./types/prompt-scope.type";
import type { SessionPromptConfig } from "./types/session-prompt-config.type";
import type { SessionStatePort } from "../ports/session-state.port";
import type { StoragePort } from "../ports/storage.port";
import type { UIPort } from "../ports/ui.port";

export const NONE_OPTION = "(None / Default)";
export const CREATE_NEW_OPTION = "+ Create new prompt...";

export class PromptService {
	constructor(
		private readonly storage: StoragePort,
		private readonly sessionState: SessionStatePort,
		private readonly ui: UIPort,
	) {}

	async getCurrentConfig(sessionId: string): Promise<SessionPromptConfig> {
		const existing = await this.sessionState.getSessionConfig(sessionId);
		if (existing) {
			if (!existing.activePrompts) {
				existing.activePrompts = existing.file
					? [{ name: existing.file, scope: existing.scope ?? "global" }]
					: [];
			}
			return existing;
		}
		const fallback: SessionPromptConfig = {
			file: null,
			scope: undefined,
			activePrompts: [],
			mode: "append",
			enabled: true,
		};
		await this.sessionState.setSessionConfig(sessionId, fallback);
		return fallback;
	}

	async updateStatus(sessionId: string): Promise<void> {
		if (!this.ui.hasUI()) return;
		const config = await this.getCurrentConfig(sessionId);
		if (!config.enabled) {
			this.ui.setStatus("🎯 sps: disabled");
			this.ui.setWidget(undefined);
			return;
		}

		const activeList =
			config.activePrompts && config.activePrompts.length > 0
				? config.activePrompts
				: config.file
					? [{ name: config.file, scope: config.scope ?? "global" }]
					: [];

		if (activeList.length === 0) {
			this.ui.setStatus("🎯 sps: none");
			this.ui.setWidget(undefined);
		} else {
			const label = activeList
				.map((p) => `[${p.scope}] ${p.name}`)
				.join(" + ");
			this.ui.setStatus(`🎯 sps: ${label} [${config.mode}]`);
			this.ui.setWidget([
				`╭─ 🎯 Active Prompt: ${label} (${config.mode} mode) ─╮`,
			]);
		}
	}

	private formatOption(name: string, scope: PromptScope): string {
		return `[${scope}] ${name}`;
	}

	private parseOption(option: string): { name: string; scope?: PromptScope } {
		const clean = option.replace(/\s+✓$/, "").trim();
		if (clean === NONE_OPTION || clean === CREATE_NEW_OPTION) {
			return { name: clean };
		}
		const match = clean.match(/^\[(local|global)\]\s+(.+)$/);
		if (match) {
			return { name: match[2].trim(), scope: match[1] as PromptScope };
		}
		return { name: clean };
	}

	async selectPrompt(sessionId: string): Promise<string | null | undefined> {
		const config = await this.getCurrentConfig(sessionId);
		const files = await this.storage.list();

		const options: string[] = [
			config.file === null && (!config.activePrompts || config.activePrompts.length === 0)
				? `${NONE_OPTION}  ✓`
				: NONE_OPTION,
			CREATE_NEW_OPTION,
		];
		for (const file of files) {
			const formatted = this.formatOption(file.name, file.scope);
			const isSelected =
				file.name === config.file && (!config.scope || config.scope === file.scope);
			options.push(isSelected ? `${formatted}  ✓` : formatted);
		}

		const choice = await this.ui.select(
			"Select System Prompt (Session Scoped)",
			options,
		);
		if (!choice) return undefined;

		const cleanChoice = choice.replace(/\s+✓$/, "").trim();
		if (cleanChoice === CREATE_NEW_OPTION) {
			return this.createNewPrompt(sessionId);
		}

		const parsed = this.parseOption(choice);
		if (parsed.name === NONE_OPTION) {
			config.file = null;
			config.scope = undefined;
			config.activePrompts = [];
			await this.sessionState.setSessionConfig(sessionId, config);
			await this.updateStatus(sessionId);
			this.ui.notify(
				"System prompt cleared. Takes effect on your next message.",
				"info",
			);
			return null;
		}

		config.file = parsed.name;
		config.scope = parsed.scope;
		config.activePrompts = [
			{ name: parsed.name, scope: parsed.scope ?? "global" },
		];
		config.enabled = true;
		await this.sessionState.setSessionConfig(sessionId, config);
		await this.updateStatus(sessionId);
		const scopeLabel = config.scope ? `[${config.scope}] ` : "";
		this.ui.notify(
			`System prompt ${scopeLabel}"${config.file}" activated. Takes effect on your next message.`,
			"info",
		);
		return parsed.name;
	}

	async injectPrompt(sessionId: string): Promise<void> {
		const config = await this.getCurrentConfig(sessionId);
		const files = await this.storage.list();
		if (files.length === 0) {
			this.ui.notify("No prompts available to inject.", "warning");
			return;
		}

		const isPromptActive = (name: string, scope: PromptScope) =>
			config.activePrompts.some((p) => p.name === name && p.scope === scope);

		const options: string[] = [
			"(Clear all injected prompts / Reset to Default)",
			"(Done)",
		];

		for (const file of files) {
			const tag = isPromptActive(file.name, file.scope) ? " [INJECTED] ✓" : "";
			options.push(`${this.formatOption(file.name, file.scope)}${tag}`);
		}

		const choice = await this.ui.select(
			"Cumulative Prompt Inject (Toggle prompts to stack)",
			options,
		);
		if (!choice || choice === "(Done)") {
			return;
		}

		if (choice.startsWith("(Clear all")) {
			config.file = null;
			config.scope = undefined;
			config.activePrompts = [];
			await this.sessionState.setSessionConfig(sessionId, config);
			await this.updateStatus(sessionId);
			this.ui.notify(
				"All injected prompts cleared. Takes effect on your next message.",
				"info",
			);
			return;
		}

		const parsed = this.parseOption(choice.replace(/\s+\[INJECTED\]\s+✓$/, ""));
		const targetName = parsed.name;
		const targetScope = parsed.scope ?? "global";

		const existingIndex = config.activePrompts.findIndex(
			(p) => p.name === targetName && p.scope === targetScope,
		);

		if (existingIndex >= 0) {
			// Toggle off
			config.activePrompts.splice(existingIndex, 1);
			if (config.file === targetName && config.scope === targetScope) {
				config.file = config.activePrompts[0]?.name ?? null;
				config.scope = config.activePrompts[0]?.scope;
			}
			await this.sessionState.setSessionConfig(sessionId, config);
			await this.updateStatus(sessionId);
			this.ui.notify(
				`Removed [${targetScope}] "${targetName}". Total active: ${config.activePrompts.length}. Takes effect on your next message.`,
				"info",
			);
		} else {
			// Toggle on
			config.activePrompts.push({ name: targetName, scope: targetScope });
			config.file = config.activePrompts[0].name;
			config.scope = config.activePrompts[0].scope;
			config.enabled = true;
			await this.sessionState.setSessionConfig(sessionId, config);
			await this.updateStatus(sessionId);
			this.ui.notify(
				`Injected [${targetScope}] "${targetName}". Total active: ${config.activePrompts.length}. Takes effect on your next message.`,
				"info",
			);
		}
	}

	private async chooseEditorAndEdit(
		filePath: string,
		fileName: string,
		initialContent: string,
	): Promise<string | undefined> {
		if (!this.ui.hasUI()) return undefined;

		const choice = await this.ui.select(
			`Choose editor to open "${fileName}":`,
			[
				"1. OMP / Pi built-in editor (in-terminal TUI)",
				"2. Visual Studio Code (code)",
				"3. System terminal editor ($EDITOR / nano / vim)",
			],
		);
		if (!choice) return undefined;

		if (choice.includes("Visual Studio Code")) {
			try {
				this.ui.notify("Opening in VS Code... Save file when done.", "info");
				const res = spawnSync("code", ["--wait", filePath], { stdio: "inherit" });
				if (res.error) {
					this.ui.notify(`VS Code error: ${res.error.message}`, "error");
					return undefined;
				}
				const updated = await this.storage.read(fileName);
				return updated ?? undefined;
			} catch (err) {
				this.ui.notify(`VS Code spawn failed: ${String(err)}`, "error");
				return undefined;
			}
		}

		if (choice.includes("System terminal editor")) {
			const cmd = process.env.EDITOR || "nano";
			try {
				spawnSync(cmd, [filePath], { stdio: "inherit" });
				const updated = await this.storage.read(fileName);
				return updated ?? undefined;
			} catch (err) {
				this.ui.notify(`Terminal editor error: ${String(err)}`, "error");
				return undefined;
			}
		}

		// Built-in editor with explicit key hints
		return this.ui.editor(
			`Edit: ${fileName} [Enter = Save & Close | Shift+Enter = Newline | Esc = Cancel]`,
			initialContent,
		);
	}

	async createNewPrompt(sessionId?: string): Promise<string | null> {
		const rawName = await this.ui.input(
			"Enter prompt file name (e.g. backend-dev.md):",
		);
		if (!rawName || !rawName.trim()) {
			this.ui.notify("Prompt creation cancelled.", "info");
			return null;
		}

		const cleanName = rawName.trim().endsWith(".md")
			? rawName.trim()
			: `${rawName.trim()}.md`;

		// Choose target scope
		let targetScope: PromptScope = "global";
		if (this.ui.hasUI()) {
			const scopeChoice = await this.ui.select(
				"Choose destination for new prompt:",
				[
					"[local] Current repo (.agents/system-prompts-switch/)",
					"[global] User home (~/.omp or ~/.pi)",
				],
			);
			if (scopeChoice && scopeChoice.includes("local")) {
				targetScope = "local";
			}
		}

		const existing = await this.storage.read(cleanName, targetScope);
		if (existing !== null) {
			this.ui.notify(
				`Prompt "${cleanName}" already exists in ${targetScope} scope!`,
				"error",
			);
			return null;
		}

		// Target directory
		const targetDir =
			targetScope === "local"
				? this.storage.getLocalDirectory()
				: this.storage.getGlobalDirectory();
		const targetPath = path.join(targetDir, cleanName);

		// Write initial stub so external editors can open the file
		const initialStub = `# ${cleanName.replace(/\.md$/, "")}\n\n`;
		await this.storage.write(cleanName, initialStub, targetScope);

		const updated = await this.chooseEditorAndEdit(
			targetPath,
			cleanName,
			initialStub,
		);
		if (updated === undefined || updated.trim().length === 0) {
			await this.storage.delete(cleanName, targetScope);
			this.ui.notify("Prompt creation cancelled.", "info");
			return null;
		}

		await this.storage.write(cleanName, updated, targetScope);
		this.ui.notify(`Saved prompt: [${targetScope}] ${cleanName}`, "info");

		if (sessionId) {
			const activate = await this.ui.confirm(
				"Activate Prompt",
				`Activate [${targetScope}] "${cleanName}" for the current session?`,
			);
			if (activate) {
				const config = await this.getCurrentConfig(sessionId);
				config.file = cleanName;
				config.scope = targetScope;
				config.activePrompts = [{ name: cleanName, scope: targetScope }];
				config.enabled = true;
				await this.sessionState.setSessionConfig(sessionId, config);
				await this.updateStatus(sessionId);
				this.ui.notify(
					`Activated [${targetScope}] "${cleanName}". Takes effect on your next message.`,
					"info",
				);
			}
		}

		return cleanName;
	}

	async editPrompt(sessionId: string): Promise<boolean> {
		const files = await this.storage.list();
		if (files.length === 0) {
			this.ui.notify("No prompt files found. Creating a new one...", "info");
			const created = await this.createNewPrompt(sessionId);
			return created !== null;
		}

		const config = await this.getCurrentConfig(sessionId);
		let targetFile: string | undefined = config.file ?? undefined;
		let targetScope: PromptScope | undefined = config.scope;

		if (!targetFile || !files.some((f) => f.name === targetFile)) {
			const choice = await this.ui.select(
				"Select prompt to edit",
				files.map((f) => this.formatOption(f.name, f.scope)),
			);
			if (!choice) return false;
			const parsed = this.parseOption(choice);
			targetFile = parsed.name;
			targetScope = parsed.scope;
		}

		const content = await this.storage.read(targetFile, targetScope);
		if (content === null) {
			this.ui.notify(`Could not read ${targetFile}`, "error");
			return false;
		}

		const targetDir =
			targetScope === "local"
				? this.storage.getLocalDirectory()
				: this.storage.getGlobalDirectory();
		const targetPath = path.join(targetDir, targetFile);

		const updated = await this.chooseEditorAndEdit(
			targetPath,
			targetFile,
			content,
		);
		if (updated === undefined) {
			this.ui.notify("Edit cancelled.", "info");
			return false;
		}

		await this.storage.write(targetFile, updated, targetScope ?? "global");
		await this.updateStatus(sessionId);
		this.ui.notify(
			`Updated prompt "${targetFile}". Takes effect on your next message.`,
			"info",
		);
		return true;
	}

	async deletePrompt(sessionId: string): Promise<boolean> {
		const files = await this.storage.list();
		if (files.length === 0) {
			this.ui.notify("No prompt files to delete.", "warning");
			return false;
		}

		const choice = await this.ui.select(
			"Select prompt to delete",
			files.map((f) => this.formatOption(f.name, f.scope)),
		);
		if (!choice) return false;

		const parsed = this.parseOption(choice);
		const target = parsed.name;
		const targetScope = parsed.scope;

		const confirmed = await this.ui.confirm(
			"Confirm Deletion",
			`Are you sure you want to permanently delete "${target}" (${targetScope ?? "all scopes"})?`,
		);
		if (!confirmed) {
			this.ui.notify("Deletion cancelled.", "info");
			return false;
		}

		const deleted = await this.storage.delete(target, targetScope);
		if (!deleted) {
			this.ui.notify(`Failed to delete "${target}".`, "error");
			return false;
		}

		const config = await this.getCurrentConfig(sessionId);
		config.activePrompts = config.activePrompts.filter(
			(p) => !(p.name === target && (!targetScope || p.scope === targetScope)),
		);

		if (config.file === target) {
			config.file = config.activePrompts[0]?.name ?? null;
			config.scope = config.activePrompts[0]?.scope;
		}

		await this.sessionState.setSessionConfig(sessionId, config);
		await this.updateStatus(sessionId);
		this.ui.notify(
			`Deleted "${target}". Takes effect on your next message.`,
			"info",
		);
		return true;
	}

	async toggleMode(sessionId: string, targetMode?: MergeMode): Promise<MergeMode> {
		const config = await this.getCurrentConfig(sessionId);
		if (targetMode) {
			config.mode = targetMode;
		} else {
			config.mode = config.mode === "replace" ? "append" : "replace";
		}
		await this.sessionState.setSessionConfig(sessionId, config);
		await this.updateStatus(sessionId);
		this.ui.notify(
			`Session prompt mode set to: ${config.mode}. Takes effect on your next message.`,
			"info",
		);
		return config.mode;
	}

	async promptNewSessionModal(sessionId: string): Promise<void> {
		if (!this.ui.hasUI()) return;
		const existing = await this.sessionState.getSessionConfig(sessionId);
		if (
			existing &&
			(existing.file !== null ||
				(existing.activePrompts && existing.activePrompts.length > 0))
		) {
			await this.updateStatus(sessionId);
			return;
		}

		const files = await this.storage.list();
		const options: string[] = [
			`${NONE_OPTION}  ✓`,
			CREATE_NEW_OPTION,
			...files.map((f) => this.formatOption(f.name, f.scope)),
		];

		const choice = await this.ui.select(
			"System Prompt for this Session",
			options,
		);
		if (!choice) {
			await this.updateStatus(sessionId);
			return;
		}

		const clean = choice.replace(/\s+✓$/, "").trim();
		if (clean === CREATE_NEW_OPTION) {
			await this.createNewPrompt(sessionId);
			return;
		}

		const parsed = this.parseOption(choice);
		const file = parsed.name === NONE_OPTION ? null : parsed.name;
		const activePrompts: ActivePromptRef[] = file
			? [{ name: file, scope: parsed.scope ?? "global" }]
			: [];

		const config: SessionPromptConfig = {
			file,
			scope: parsed.scope,
			activePrompts,
			mode: "append",
			enabled: true,
		};

		await this.sessionState.setSessionConfig(sessionId, config);
		await this.updateStatus(sessionId);
		if (file) {
			const scopeLabel = parsed.scope ? `[${parsed.scope}] ` : "";
			this.ui.notify(
				`System prompt ${scopeLabel}"${file}" activated. Takes effect on your next message.`,
				"info",
			);
		}
	}

	async resolvePromptForTurn(
		sessionId: string,
		input: Omit<BuildPromptInput, "customPrompt" | "mode">,
	): Promise<string> {
		const config = await this.getCurrentConfig(sessionId);
		if (!config.enabled) {
			return input.basePrompt;
		}

		const activeList: ActivePromptRef[] =
			config.activePrompts && config.activePrompts.length > 0
				? config.activePrompts
				: config.file
					? [{ name: config.file, scope: config.scope ?? "global" }]
					: [];

		if (activeList.length === 0) {
			return input.basePrompt;
		}

		const chunks: CustomPromptChunk[] = [];
		for (const promptRef of activeList) {
			const content = await this.storage.read(promptRef.name, promptRef.scope);
			if (content && content.trim().length > 0) {
				chunks.push({
					name: promptRef.name,
					scope: promptRef.scope,
					content,
				});
			}
		}

		if (chunks.length === 0) {
			return input.basePrompt;
		}

		return buildSystemPrompt({
			...input,
			customPrompts: chunks,
			mode: config.mode,
		});
	}
}
