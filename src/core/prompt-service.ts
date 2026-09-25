import { buildSystemPrompt } from "./prompt-builder";
import type { BuildPromptInput, MergeMode, SessionPromptConfig } from "./types";
import type { SessionStatePort } from "../ports/session-state.port";
import type { StoragePort } from "../ports/storage.port";
import type { UIPort } from "../ports/ui.port";

export const NONE_OPTION = "(None / Default)";

export class PromptService {
	constructor(
		private readonly storage: StoragePort,
		private readonly sessionState: SessionStatePort,
		private readonly ui: UIPort,
	) {}

	async getCurrentConfig(sessionId: string): Promise<SessionPromptConfig> {
		const existing = await this.sessionState.getSessionConfig(sessionId);
		if (existing) {
			return existing;
		}
		const fallback: SessionPromptConfig = {
			file: null,
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
			this.ui.setStatus("sps: disabled");
		} else if (config.file) {
			this.ui.setStatus(`sps: ${config.file} [${config.mode}]`);
		} else {
			this.ui.setStatus("sps: none");
		}
	}

	async selectPrompt(sessionId: string): Promise<string | null | undefined> {
		const config = await this.getCurrentConfig(sessionId);
		const files = await this.storage.list();

		const options: string[] = [
			config.file === null ? `${NONE_OPTION}  ✓` : NONE_OPTION,
		];
		for (const file of files) {
			options.push(file.name === config.file ? `${file.name}  ✓` : file.name);
		}

		const choice = await this.ui.select(
			"Select System Prompt (Session Scoped)",
			options,
		);
		if (!choice) return undefined;

		const cleanChoice = choice.replace(/\s+✓$/, "").trim();
		if (cleanChoice === NONE_OPTION) {
			config.file = null;
			await this.sessionState.setSessionConfig(sessionId, config);
			await this.updateStatus(sessionId);
			this.ui.notify("System prompt cleared. Using default prompt.", "info");
			return null;
		}

		config.file = cleanChoice;
		config.enabled = true;
		await this.sessionState.setSessionConfig(sessionId, config);
		await this.updateStatus(sessionId);
		this.ui.notify(
			`Selected: ${config.file} (${config.mode} mode) for this session.`,
			"info",
		);
		return cleanChoice;
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

		const existing = await this.storage.read(cleanName);
		if (existing !== null) {
			this.ui.notify(`Prompt "${cleanName}" already exists!`, "error");
			return null;
		}

		const content = await this.ui.editor(
			`Create System Prompt: ${cleanName}`,
			`# ${cleanName.replace(/\.md$/, "")}\n\n`,
		);
		if (content === undefined || content.trim().length === 0) {
			this.ui.notify("Prompt creation aborted (empty or cancelled).", "info");
			return null;
		}

		await this.storage.write(cleanName, content);
		this.ui.notify(`Saved prompt: ${cleanName}`, "info");

		if (sessionId) {
			const activate = await this.ui.confirm(
				"Activate Prompt",
				`Activate "${cleanName}" for the current session?`,
			);
			if (activate) {
				const config = await this.getCurrentConfig(sessionId);
				config.file = cleanName;
				config.enabled = true;
				await this.sessionState.setSessionConfig(sessionId, config);
				await this.updateStatus(sessionId);
				this.ui.notify(`Activated "${cleanName}" for this session.`, "info");
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

		if (!targetFile || !files.some((f) => f.name === targetFile)) {
			const choice = await this.ui.select(
				"Select prompt to edit",
				files.map((f) => f.name),
			);
			if (!choice) return false;
			targetFile = choice;
		}

		const content = await this.storage.read(targetFile);
		if (content === null) {
			this.ui.notify(`Could not read ${targetFile}`, "error");
			return false;
		}

		const updated = await this.ui.editor(`Edit Prompt: ${targetFile}`, content);
		if (updated === undefined) {
			this.ui.notify("Edit cancelled.", "info");
			return false;
		}

		await this.storage.write(targetFile, updated);
		this.ui.notify(`Updated prompt: ${targetFile}`, "info");
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
			files.map((f) => f.name),
		);
		if (!choice) return false;

		const target = choice.replace(/\s+✓$/, "").trim();
		const confirmed = await this.ui.confirm(
			"Confirm Deletion",
			`Are you sure you want to permanently delete "${target}"?`,
		);
		if (!confirmed) {
			this.ui.notify("Deletion cancelled.", "info");
			return false;
		}

		const deleted = await this.storage.delete(target);
		if (!deleted) {
			this.ui.notify(`Failed to delete "${target}".`, "error");
			return false;
		}

		const config = await this.getCurrentConfig(sessionId);
		if (config.file === target) {
			config.file = null;
			await this.sessionState.setSessionConfig(sessionId, config);
			await this.updateStatus(sessionId);
			this.ui.notify(`Deleted "${target}". Current session prompt reset to default.`, "info");
		} else {
			this.ui.notify(`Deleted "${target}".`, "info");
		}
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
		this.ui.notify(`Session prompt mode set to: ${config.mode}`, "info");
		return config.mode;
	}

	async promptNewSessionModal(sessionId: string): Promise<void> {
		if (!this.ui.hasUI()) return;
		const existing = await this.sessionState.getSessionConfig(sessionId);
		// If session already has an explicitly configured file or disabled state, do not interrupt
		if (existing && existing.file !== null) {
			await this.updateStatus(sessionId);
			return;
		}

		const files = await this.storage.list();
		const options: string[] = [`${NONE_OPTION}  ✓`, ...files.map((f) => f.name)];

		const choice = await this.ui.select(
			"System Prompt for New Session",
			options,
		);
		if (!choice) {
			await this.updateStatus(sessionId);
			return;
		}

		const clean = choice.replace(/\s+✓$/, "").trim();
		const file = clean === NONE_OPTION ? null : clean;
		const config: SessionPromptConfig = {
			file,
			mode: "append",
			enabled: true,
		};

		await this.sessionState.setSessionConfig(sessionId, config);
		await this.updateStatus(sessionId);
		if (file) {
			this.ui.notify(`Session initialized with prompt: ${file}`, "info");
		}
	}

	async resolvePromptForTurn(
		sessionId: string,
		input: Omit<BuildPromptInput, "customPrompt" | "mode">,
	): Promise<string> {
		const config = await this.getCurrentConfig(sessionId);
		if (!config.enabled || !config.file) {
			return input.basePrompt;
		}

		const customContent = await this.storage.read(config.file);
		if (!customContent || !customContent.trim()) {
			return input.basePrompt;
		}

		return buildSystemPrompt({
			...input,
			customPrompt: customContent,
			mode: config.mode,
		});
	}
}
