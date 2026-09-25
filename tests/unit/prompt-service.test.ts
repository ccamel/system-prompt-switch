import { beforeEach, describe, expect, it } from "bun:test";
import { NONE_OPTION, PromptService } from "../../src/core/prompt-service";
import type { PromptFileInfo } from "../../src/core/types/prompt-file-info.type";
import type { PromptScope } from "../../src/core/types/prompt-scope.type";
import type { SessionPromptConfig } from "../../src/core/types/session-prompt-config.type";
import type { SessionStatePort } from "../../src/ports/session-state.port";
import type { StoragePort } from "../../src/ports/storage.port";
import type { UIPort } from "../../src/ports/ui.port";

class MockStorage implements StoragePort {
	files = new Map<string, string>();

	async list(): Promise<PromptFileInfo[]> {
		return Array.from(this.files.entries()).map(([name, content]) => ({
			name,
			path: `/prompts/${name}`,
			scope: "global" as PromptScope,
			sizeChars: content.length,
			modifiedAt: 1000,
		}));
	}

	async read(name: string, _scope?: PromptScope): Promise<string | null> {
		return this.files.get(name) ?? null;
	}

	async write(name: string, content: string, _scope?: PromptScope): Promise<void> {
		this.files.set(name, content);
	}

	async delete(name: string, _scope?: PromptScope): Promise<boolean> {
		return this.files.delete(name);
	}

	getGlobalDirectory(): string {
		return "/prompts/global";
	}

	getLocalDirectory(): string {
		return "/prompts/local";
	}

	setCwd(_cwd: string): void {}
}

class MockSessionState implements SessionStatePort {
	sessions = new Map<string, SessionPromptConfig>();

	async getSessionConfig(sessionId: string): Promise<SessionPromptConfig | null> {
		return this.sessions.get(sessionId) ?? null;
	}

	async setSessionConfig(
		sessionId: string,
		config: SessionPromptConfig,
	): Promise<void> {
		this.sessions.set(sessionId, { ...config });
	}
}

class MockUI implements UIPort {
	selectChoice: string | undefined;
	selectChoices: string[] = [];
	inputValue: string | undefined;
	editorValue: string | undefined;
	confirmValue = true;
	notifications: Array<{ message: string; type?: string }> = [];
	currentStatus: string | undefined;
	currentWidget: string[] | undefined;
	hasUIValue = true;

	hasUI(): boolean {
		return this.hasUIValue;
	}
	async select(): Promise<string | undefined> {
		return this.selectChoices.shift() ?? this.selectChoice;
	}

	async input(): Promise<string | undefined> {
		return this.inputValue;
	}

	async editor(): Promise<string | undefined> {
		return this.editorValue;
	}

	async confirm(): Promise<boolean> {
		return this.confirmValue;
	}

	notify(message: string, type?: "info" | "warning" | "error"): void {
		this.notifications.push({ message, type });
	}

	setStatus(text: string | undefined): void {
		this.currentStatus = text;
	}

	setWidget(content: string[] | undefined): void {
		this.currentWidget = content;
	}
}

describe("PromptService", () => {
	let storage: MockStorage;
	let sessionState: MockSessionState;
	let ui: MockUI;
	let service: PromptService;

	beforeEach(() => {
		storage = new MockStorage();
		sessionState = new MockSessionState();
		ui = new MockUI();
		service = new PromptService(storage, sessionState, ui);
	});

	it("returns default config when session has no prior config", async () => {
		const config = await service.getCurrentConfig("sess-1");
		expect(config.file).toBeNull();
		expect(config.mode).toBe("append");
		expect(config.enabled).toBe(true);
	});

	it("clears prompt when NONE_OPTION is chosen in selectPrompt", async () => {
		await sessionState.setSessionConfig("sess-1", {
			file: "coder.md",
			mode: "append",
			enabled: true,
		});
		ui.selectChoice = NONE_OPTION;

		const result = await service.selectPrompt("sess-1");
		expect(result).toBeNull();

		const updated = await service.getCurrentConfig("sess-1");
		expect(updated.file).toBeNull();
		expect(ui.currentStatus).toBe("🎯 sps: none");
	});

	it("selects a file when chosen in selectPrompt", async () => {
		storage.files.set("reviewer.md", "You are a reviewer.");
		ui.selectChoice = "[global] reviewer.md";

		const result = await service.selectPrompt("sess-1");
		expect(result).toBe("reviewer.md");

		const updated = await service.getCurrentConfig("sess-1");
		expect(updated.file).toBe("reviewer.md");
		expect(ui.currentStatus).toBe("🎯 sps: [global] reviewer.md [append]");
	});

	it("creates a new prompt and can activate it for session", async () => {
		ui.inputValue = "security-auditor";
		ui.selectChoices = [
			"[global] User home (~/.omp or ~/.pi)",
			"1. OMP / Pi built-in editor",
		];
		ui.editorValue = "Audit for vulnerabilities.";
		ui.confirmValue = true; // activate for session
		const result = await service.createNewPrompt("sess-1");
		expect(result).toBe("security-auditor.md");
		expect(storage.files.get("security-auditor.md")).toBe(
			"Audit for vulnerabilities.",
		);

		const updated = await service.getCurrentConfig("sess-1");
		expect(updated.file).toBe("security-auditor.md");
	});

	it("edits an existing prompt", async () => {
		storage.files.set("dev.md", "Original content");
		await sessionState.setSessionConfig("sess-1", {
			file: "dev.md",
			mode: "append",
			enabled: true,
		});
		ui.selectChoices = ["1. OMP / Pi built-in editor"];
		ui.editorValue = "Updated content";

		const success = await service.editPrompt("sess-1");
		expect(success).toBe(true);
		expect(storage.files.get("dev.md")).toBe("Updated content");
	});

	it("deletes a prompt and resets current session if it was active", async () => {
		storage.files.set("temp.md", "temp content");
		await sessionState.setSessionConfig("sess-1", {
			file: "temp.md",
			mode: "append",
			enabled: true,
		});
		ui.selectChoice = "[global] temp.md";
		ui.confirmValue = true;

		const success = await service.deletePrompt("sess-1");
		expect(success).toBe(true);
		expect(storage.files.has("temp.md")).toBe(false);

		const updated = await service.getCurrentConfig("sess-1");
		expect(updated.file).toBeNull();
		expect(ui.currentStatus).toBe("🎯 sps: none");
	});

	it("toggles mode between append and replace", async () => {
		const m1 = await service.toggleMode("sess-1");
		expect(m1).toBe("replace");

		const m2 = await service.toggleMode("sess-1");
		expect(m2).toBe("append");

		const m3 = await service.toggleMode("sess-1", "replace");
		expect(m3).toBe("replace");
	});

	it("resolves prompt for turn with custom content", async () => {
		storage.files.set("pirate.md", "Speak like a pirate captain.");
		await sessionState.setSessionConfig("sess-1", {
			file: "pirate.md",
			mode: "append",
			enabled: true,
		});

		const result = await service.resolvePromptForTurn("sess-1", {
			basePrompt: "Base prompt",
		});
		expect(result).toBe(
			"Base prompt\n\n---\n\n## Custom system prompt\n\n### [global] pirate.md\n\nSpeak like a pirate captain.",
		);
	});

	it("cumulatively injects multiple prompts", async () => {
		storage.files.set("prompt1.md", "Prompt 1 content");
		storage.files.set("prompt2.md", "Prompt 2 content");

		// Inject first prompt
		ui.selectChoices = ["[global] prompt1.md"];
		await service.injectPrompt("sess-1");

		let config = await service.getCurrentConfig("sess-1");
		expect(config.activePrompts.length).toBe(1);

		// Inject second prompt
		ui.selectChoices = ["[global] prompt2.md"];
		await service.injectPrompt("sess-1");

		config = await service.getCurrentConfig("sess-1");
		expect(config.activePrompts.length).toBe(2);
		expect(ui.currentStatus).toContain("[global] prompt1.md + [global] prompt2.md");
		expect(ui.currentWidget?.[0]).toContain("Active Prompt: [global] prompt1.md + [global] prompt2.md");

		// Resolves turn with both prompts combined
		const result = await service.resolvePromptForTurn("sess-1", {
			basePrompt: "Base instructions",
		});
		expect(result).toContain("Prompt 1 content");
		expect(result).toContain("Prompt 2 content");
	});
});
