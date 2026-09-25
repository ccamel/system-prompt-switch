import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import systemPromptSwitchExtension from "../../extensions/index";

describe("Extension Lifecycle E2E", () => {
	let tempDir: string;
	let promptsDir: string;
	let stateDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sps-e2e-"));
		promptsDir = path.join(tempDir, "prompts");
		stateDir = path.join(tempDir, "state");

		fs.mkdirSync(promptsDir, { recursive: true });
		fs.mkdirSync(stateDir, { recursive: true });
		process.env.PI_SYSTEM_PROMPT_DIR = promptsDir;
		process.env.PI_SYSTEM_PROMPT_STATE_PATH = path.join(stateDir, "sessions.json");

		fs.writeFileSync(
			path.join(promptsDir, "test-prompt.md"),
			"You are an E2E test assistant.",
			"utf-8",
		);
	});

	afterEach(() => {
		delete process.env.PI_SYSTEM_PROMPT_DIR;
		delete process.env.PI_SYSTEM_PROMPT_STATE_PATH;
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup
		}
	});

	it("registers commands and handles lifecycle events", async () => {
		const registeredCommands = new Map<string, unknown>();
		type HandlerFn = (event: unknown, ctx: unknown) => unknown;
		const eventHandlers = new Map<string, HandlerFn[]>();
		const appendedEntries: Array<{ customType: string; data?: unknown }> = [];

		const mockPi = {
			registerCommand(name: string, options: unknown) {
				registeredCommands.set(name, options);
			},
			on(event: string, handler: HandlerFn) {
				const existing = eventHandlers.get(event) ?? [];
				existing.push(handler);
				eventHandlers.set(event, existing);
			},
			appendEntry(customType: string, data?: unknown) {
				appendedEntries.push({ customType, data });
			},
		} as unknown as ExtensionAPI;

		// Load extension
		systemPromptSwitchExtension(mockPi);

		// Assert all required commands are registered
		expect(registeredCommands.has("sps-select")).toBe(true);
		expect(registeredCommands.has("sps-new")).toBe(true);
		expect(registeredCommands.has("sps-edit")).toBe(true);
		expect(registeredCommands.has("sps-delete")).toBe(true);
		expect(registeredCommands.has("sps-mode")).toBe(true);
		expect(registeredCommands.has("sps-info")).toBe(true);

		// Assert event handlers registered
		expect(eventHandlers.has("session_start")).toBe(true);
		expect(eventHandlers.has("before_agent_start")).toBe(true);
		expect(eventHandlers.has("session_shutdown")).toBe(true);

		// Mock context
		let selectTriggered = false;
		let currentStatus: string | undefined;
		const mockCtx = {
			hasUI: true,
			cwd: tempDir,
			sessionManager: {
				getSessionId: () => "sess-e2e-1",
				getEntries: () => [],
			},
			ui: {
				select: async (_title: string, _options: string[]) => {
					selectTriggered = true;
					return "test-prompt.md";
				},
				notify: () => {},
				setStatus: (_key: string, text: string | undefined) => {
					currentStatus = text;
				},
			},
		} as unknown as ExtensionContext;

		// 1. Trigger session_start (reason: "new")
		const sessionStartHandlers = eventHandlers.get("session_start")!;
		for (const h of sessionStartHandlers) {
			await h({ type: "session_start", reason: "new" }, mockCtx);
		}

		expect(selectTriggered).toBe(true);
		expect(currentStatus).toBe("sps: test-prompt.md [append]");

		// 2. Trigger before_agent_start
		const beforeAgentHandlers = eventHandlers.get("before_agent_start")!;
		let result: { systemPrompt?: string } | undefined;
		for (const h of beforeAgentHandlers) {
			const res = (await h(
				{
					type: "before_agent_start",
					prompt: "hello",
					systemPrompt: "Default Pi System Prompt",
				},
				mockCtx,
			)) as { systemPrompt?: string } | undefined;
			if (res) result = res;
		}

		expect(result).toBeDefined();
		expect(result?.systemPrompt).toContain("Default Pi System Prompt");
		expect(result?.systemPrompt).toContain("You are an E2E test assistant.");

		// 3. Trigger session_shutdown
		const shutdownHandlers = eventHandlers.get("session_shutdown")!;
		for (const h of shutdownHandlers) {
			await h({ type: "session_shutdown" }, mockCtx);
		}
		expect(currentStatus).toBeUndefined();
	});
});
