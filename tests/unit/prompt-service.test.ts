import { beforeEach, describe, expect, it } from "bun:test";
import { NONE_OPTION, PromptService } from "../../src/core/prompt-service";
import type { PromptFileInfo } from "../../src/core/types/prompt-file-info.type";
import type { PromptScope } from "../../src/core/types/prompt-scope.type";
import type { SessionPromptConfig } from "../../src/core/types/session-prompt-config.type";
import type { SessionStatePort } from "../../src/ports/session-state.port";
import type { StoragePort } from "../../src/ports/storage.port";
import type { UIPort } from "../../src/ports/ui.port";

class MockStorage implements StoragePort {
	localFiles = new Map<string, string>();
	globalFiles = new Map<string, string>();

	get files(): Map<string, string> {
		return this.globalFiles;
	}

	async list(): Promise<PromptFileInfo[]> {
		const locals = Array.from(this.localFiles.entries()).map(([name, content]) => ({
			name,
			path: `/prompts/local/${name}`,
			scope: "local" as PromptScope,
			sizeChars: content.length,
			modifiedAt: 1000,
		}));
		const globals = Array.from(this.globalFiles.entries()).map(([name, content]) => ({
			name,
			path: `/prompts/global/${name}`,
			scope: "global" as PromptScope,
			sizeChars: content.length,
			modifiedAt: 1000,
		}));
		return [...locals, ...globals];
	}

	async read(name: string, scope?: PromptScope): Promise<string | null> {
		if (scope === "local") return this.localFiles.get(name) ?? null;
		if (scope === "global") return this.globalFiles.get(name) ?? null;
		return this.localFiles.get(name) ?? this.globalFiles.get(name) ?? null;
	}

	async write(name: string, content: string, scope: PromptScope = "global"): Promise<void> {
		if (scope === "local") {
			this.localFiles.set(name, content);
		} else {
			this.globalFiles.set(name, content);
		}
	}

	async delete(name: string, scope?: PromptScope): Promise<boolean> {
		if (scope === "local") return this.localFiles.delete(name);
		if (scope === "global") return this.globalFiles.delete(name);
		return this.localFiles.delete(name) || this.globalFiles.delete(name);
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
	currentWidget: string[] | undefined;
	widgetHistory: Array<string[] | undefined> = [];
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


	setWidget(content: string[] | undefined): void {
		this.currentWidget = content;
		this.widgetHistory.push(content);
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
		expect(ui.currentWidget?.[0]).toContain("Active Prompt: (none) (append mode)");
	});

	it("selects a file when chosen in selectPrompt", async () => {
		storage.files.set("reviewer.md", "You are a reviewer.");
		ui.selectChoice = "[global] reviewer.md";

		const result = await service.selectPrompt("sess-1");
		expect(result).toBe("reviewer.md");

		const updated = await service.getCurrentConfig("sess-1");
		expect(updated.file).toBe("reviewer.md");
		expect(ui.currentWidget?.[0]).toContain("[global] reviewer.md (append mode)");
	});

	it("creates a new prompt and can activate it for session", async () => {
		ui.inputValue = "security-auditor";
		ui.selectChoices = ["[global] User home (~/.omp or ~/.pi)"];
		ui.editorValue = "Audit for vulnerabilities.";
		const result = await service.createNewPrompt("sess-1");
		expect(result).toBe("security-auditor.md");
		expect(storage.files.get("security-auditor.md")).toBe(
			"Audit for vulnerabilities.",
		);

		const updated = await service.getCurrentConfig("sess-1");
		expect(updated.file).toBe("security-auditor.md");
	});

	it("shows the editor-shortcut banner widget while creating a prompt, then restores status", async () => {
		ui.inputValue = "auditor.md";
		ui.editorValue = "Audit body.";

		const beforeHistoryLength = ui.widgetHistory.length;
		await service.createNewPrompt("sess-1");

		const bannerWidget = ui.widgetHistory
			.slice(beforeHistoryLength)
			.find((w) => w?.some((line) => line.includes("Editor shortcuts")));

		expect(bannerWidget).toBeDefined();
		expect(bannerWidget?.some((line) => line.includes("Ctrl+Q"))).toBe(true);
		expect(bannerWidget?.some((line) => line.includes("Esc"))).toBe(true);

		const finalWidget = ui.widgetHistory[ui.widgetHistory.length - 1];
		expect(finalWidget?.[0]).toContain("Active Prompt");
	});

	it("edits an existing prompt", async () => {
		storage.files.set("dev.md", "Original content");
		await sessionState.setSessionConfig("sess-1", {
			file: "dev.md",
			mode: "append",
			enabled: true,
		});
		ui.selectChoices = [];
		ui.editorValue = "Updated content";

		const success = await service.editPrompt("sess-1");
		expect(success).toBe(true);
		expect(storage.files.get("dev.md")).toBe("Updated content");
	});

	it("shows the editor-shortcut banner widget while editing a prompt, then restores status", async () => {
		storage.files.set("dev.md", "Original content");
		await sessionState.setSessionConfig("sess-1", {
			file: "dev.md",
			mode: "append",
			enabled: true,
		});
		ui.selectChoices = [];
		ui.editorValue = "Updated content";

		const beforeHistoryLength = ui.widgetHistory.length;
		await service.editPrompt("sess-1");

		const bannerWidget = ui.widgetHistory
			.slice(beforeHistoryLength)
			.find((w) => w?.some((line) => line.includes("Editor shortcuts")));

		expect(bannerWidget).toBeDefined();
		expect(bannerWidget?.some((line) => line.includes("Ctrl+Q"))).toBe(true);
		expect(bannerWidget?.some((line) => line.includes("Esc"))).toBe(true);

		const finalWidget = ui.widgetHistory[ui.widgetHistory.length - 1];
		expect(finalWidget?.[0]).toContain("Active Prompt");
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
		expect(ui.currentWidget?.[0]).toContain("Active Prompt: (none) (append mode)");
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
		expect(ui.currentWidget?.[0]).toContain("Active Prompt: [global] prompt1.md (append mode)");

		// Resolves turn with both prompts combined
		const result = await service.resolvePromptForTurn("sess-1", {
			basePrompt: "Base instructions",
		});
		expect(result).toContain("Prompt 1 content");
		expect(result).toContain("Prompt 2 content");
	});

	it("keeps primary stable when injecting a same-named prompt from another scope", async () => {
		storage.globalFiles.set("b.md", "Global B");
		storage.localFiles.set("b.md", "Local B");
		await sessionState.setSessionConfig("sess-1", {
			file: "b.md",
			scope: "local",
			activePrompts: [{ name: "b.md", scope: "local" }],
			mode: "append",
			enabled: true,
		});

		ui.selectChoices = ["[global] b.md"];
		await service.injectPrompt("sess-1");

		const config = await service.getCurrentConfig("sess-1");
		expect(config.activePrompts).toEqual([
			{ name: "b.md", scope: "local" },
			{ name: "b.md", scope: "global", injected: true },
		]);
		expect(config.file).toBe("b.md");
		expect(config.scope).toBe("local");
	});

	it("does not toggle off the primary in inject modal", async () => {
		await sessionState.setSessionConfig("sess-1", {
			file: "b.md",
			scope: "local",
			activePrompts: [{ name: "b.md", scope: "local" }],
			mode: "append",
			enabled: true,
		});
		storage.localFiles.set("b.md", "Local B");

		ui.selectChoices = ["[local] b.md [SELECTED] ✓"];
		await service.injectPrompt("sess-1");

		const config = await service.getCurrentConfig("sess-1");
		expect(config.activePrompts).toEqual([
			{ name: "b.md", scope: "local" },
		]);
		expect(config.file).toBe("b.md");
		expect(config.scope).toBe("local");
		expect(
			ui.notifications.some((n) =>
				n.message.toLowerCase().includes("primary"),
			),
		).toBe(true);
	});

	it("toggles off a non-primary injection without touching the primary", async () => {
		storage.globalFiles.set("a.md", "A");
		storage.localFiles.set("b.md", "Local B");
		await sessionState.setSessionConfig("sess-1", {
			file: "b.md",
			scope: "local",
			activePrompts: [
				{ name: "b.md", scope: "local" },
				{ name: "a.md", scope: "global" },
			],
			mode: "append",
			enabled: true,
		});

		ui.selectChoices = ["[global] a.md [INJECTED] ✓"];
		await service.injectPrompt("sess-1");

		const config = await service.getCurrentConfig("sess-1");
		expect(config.activePrompts).toEqual([
			{ name: "b.md", scope: "local" },
		]);
		expect(config.file).toBe("b.md");
		expect(config.scope).toBe("local");
	});

	it("does not change primary when injecting on a stack that already has one", async () => {
		storage.globalFiles.set("a.md", "A");
		storage.localFiles.set("b.md", "Local B");
		await sessionState.setSessionConfig("sess-1", {
			file: "b.md",
			scope: "local",
			activePrompts: [{ name: "b.md", scope: "local" }],
			mode: "append",
			enabled: true,
		});

		ui.selectChoices = ["[global] a.md"];
		await service.injectPrompt("sess-1");

		const config = await service.getCurrentConfig("sess-1");
		expect(config.activePrompts).toEqual([
			{ name: "b.md", scope: "local" },
			{ name: "a.md", scope: "global", injected: true },
		]);
		expect(config.file).toBe("b.md");
		expect(config.scope).toBe("local");
	});

	it("marks entries pushed by injectPrompt with injected: true", async () => {
		storage.files.set("a.md", "A primary");
		storage.files.set("b.md", "B extra");
		await sessionState.setSessionConfig("sess-1", {
			file: "a.md",
			scope: "global",
			activePrompts: [{ name: "a.md", scope: "global" }],
			mode: "append",
			enabled: true,
		});

		ui.selectChoices = ["[global] b.md"];
		await service.injectPrompt("sess-1");

		const config = await service.getCurrentConfig("sess-1");
		const ref = config.activePrompts.find(
			(p) => p.name === "b.md" && p.scope === "global",
		);
		expect(ref?.injected).toBe(true);
	});

	it("does not mark the primary as injected when selectPrompt sets it", async () => {
		storage.files.set("a.md", "A");
		ui.selectChoice = "[global] a.md";

		await service.selectPrompt("sess-sel");

		const config = await service.getCurrentConfig("sess-sel");
		expect(config.activePrompts).toEqual([
			{ name: "a.md", scope: "global" },
		]);
		expect(config.activePrompts[0].injected).toBeUndefined();
	});

	it("resolvePromptForTurn strips injected entries and keeps the primary", async () => {
		storage.files.set("b.md", "B content");
		storage.files.set("c.md", "C content");
		await sessionState.setSessionConfig("sess-resolve", {
			file: "b.md",
			scope: "global",
			activePrompts: [
				{ name: "b.md", scope: "global" },
				{ name: "c.md", scope: "global", injected: true },
			],
			mode: "append",
			enabled: true,
		});

		const result = await service.resolvePromptForTurn("sess-resolve", {
			basePrompt: "Base",
		});
		expect(result).toContain("B content");
		expect(result).toContain("C content");

		const config = await service.getCurrentConfig("sess-resolve");
		expect(config.activePrompts).toEqual([
			{ name: "b.md", scope: "global" },
		]);

		const nextResult = await service.resolvePromptForTurn("sess-resolve", {
			basePrompt: "Base",
		});
		expect(nextResult).toContain("B content");
		expect(nextResult).not.toContain("C content");
	});

	it("widget shows only the primary even when an injection is pending", async () => {
		storage.files.set("b.md", "B content");
		storage.files.set("c.md", "C content");
		await sessionState.setSessionConfig("sess-widget", {
			file: "b.md",
			scope: "global",
			activePrompts: [
				{ name: "b.md", scope: "global" },
				{ name: "c.md", scope: "global", injected: true },
			],
			mode: "append",
			enabled: true,
		});

		await service.updateStatus("sess-widget");

		expect(ui.currentWidget?.[0]).toContain(
			"Active Prompt: [global] b.md (append mode)",
		);
		expect(ui.currentWidget?.[0]).not.toContain("c.md");
		expect(ui.currentWidget?.[0]).not.toContain("extra");
	});

	it("defaults to None and clears widget when startup modal is dismissed", async () => {
		ui.selectChoice = undefined; // user pressed Esc or cancelled
		await service.promptNewSessionModal("sess-dismiss");

		const config = await service.getCurrentConfig("sess-dismiss");
		expect(config.file).toBeNull();
		expect(config.activePrompts.length).toBe(0);
		expect(ui.currentWidget?.[0]).toContain("Active Prompt: (none) (append mode)");
	});

	it("allows creating a local prompt with the same name as an existing global prompt", async () => {
		storage.globalFiles.set("guidelines.md", "Global guidelines");

		ui.inputValue = "guidelines";
		ui.selectChoices = ["1. Built-in terminal editor"];
		ui.editorValue = "Local specific guidelines";

		const result = await service.createNewPrompt("sess-col-1", "local");
		expect(result).toBe("guidelines.md");
		expect(storage.localFiles.get("guidelines.md")).toBe("Local specific guidelines");
		expect(storage.globalFiles.get("guidelines.md")).toBe("Global guidelines");
	});

	it("rejects creating a local prompt when same name exists in local scope", async () => {
		storage.localFiles.set("duplicate.md", "Existing local content");

		ui.inputValue = "duplicate";
		const result = await service.createNewPrompt("sess-col-2", "local");
		expect(result).toBeNull();
		const lastNotification = ui.notifications[ui.notifications.length - 1];
		expect(lastNotification.message).toContain("already exists in local scope");
	});

	it("rejects creating a global prompt when same name exists in global scope", async () => {
		storage.globalFiles.set("duplicate.md", "Existing global content");

		ui.inputValue = "duplicate";
		const result = await service.createNewPrompt("sess-col-3", "global");
		expect(result).toBeNull();
		const lastNotification = ui.notifications[ui.notifications.length - 1];
		expect(lastNotification.message).toContain("already exists in global scope");
	});

	it("returns formatted paths summary including active prompt and directories", async () => {
		storage.localFiles.set("local-prompt.md", "local");
		storage.globalFiles.set("global-prompt.md", "global");

		await sessionState.setSessionConfig("sess-paths", {
			file: "local-prompt.md",
			scope: "local",
			activePrompts: [{ name: "local-prompt.md", scope: "local" }],
			mode: "append",
			enabled: true,
		});

		const summary = await service.getPathsSummary("sess-paths");
		const text = summary.join("\n");
		expect(text).toContain("=== System Prompt Switch — Paths ===");
		expect(text).toContain("Active Prompt:");
		expect(text).toContain("[local] /prompts/local/local-prompt.md");
		expect(text).toContain("Directories:");
		expect(text).toContain("Local:  /prompts/local");
		expect(text).toContain("Global: /prompts/global");
		expect(text).toContain("All Available Prompts:");
		expect(text).toContain("/prompts/local/local-prompt.md");
		expect(text).toContain("/prompts/global/global-prompt.md");
	});
});
