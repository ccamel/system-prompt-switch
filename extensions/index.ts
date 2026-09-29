import type {
	BeforeAgentStartEvent,
	BeforeAgentStartEventResult,
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { FsStorageAdapter } from "../src/adapters/fs-storage.adapter";
import { PiUIAdapter } from "../src/adapters/pi-ui.adapter";
import { SessionStateAdapter } from "../src/adapters/session-state.adapter";
import { resolveHostPaths } from "../src/core/paths";
import { PromptService, formatScope, resolveScope } from "../src/core/prompt-service";
import { logger } from "../src/core/logger";
import type { ActivePromptRef } from "../src/core/types/active-prompt-ref.type";
import { PromptScope } from "../src/core/types/prompt-scope.type";
import {
	ExtensionCommand,
	EXTENSION_COMMAND_CATALOG,
} from "../src/core/types/extension-command.type";
import type { MergeMode } from "../src/core/types/merge-mode.type";

export default function systemPromptSwitchExtension(pi: ExtensionAPI): void {
	const storage = new FsStorageAdapter();
	const sessionState = new SessionStateAdapter();
	const uiAdapter = new PiUIAdapter();
	const service = new PromptService(storage, sessionState, uiAdapter);

	// Wire session entry persistence into Pi session JSONL
	sessionState.setAppendEntryFn((customType, data) => {
		pi.appendEntry(customType, data);
	});

	function bindHost(ctx: ExtensionContext): string {
		uiAdapter.setHost(ctx);
		storage.setCwd(ctx.cwd);
		sessionState.setEntryProvider(ctx.sessionManager);
		return ctx.sessionManager.getSessionId() || "default";
	}

	// --- Commands ---

	pi.registerCommand(ExtensionCommand.SELECT, {
		description: EXTENSION_COMMAND_CATALOG[ExtensionCommand.SELECT].description,
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const sessionId = bindHost(ctx);
			await service.selectPrompt(sessionId);
		},
	});

	pi.registerCommand(ExtensionCommand.INJECT, {
		description: EXTENSION_COMMAND_CATALOG[ExtensionCommand.INJECT].description,
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const sessionId = bindHost(ctx);
			await service.injectPrompt(sessionId);
		},
	});


	pi.registerCommand(ExtensionCommand.NEW, {
		description: EXTENSION_COMMAND_CATALOG[ExtensionCommand.NEW].description,
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const sessionId = bindHost(ctx);
			await service.createNewPrompt(sessionId);
		},
	});

	pi.registerCommand(ExtensionCommand.EDIT, {
		description: EXTENSION_COMMAND_CATALOG[ExtensionCommand.EDIT].description,
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const sessionId = bindHost(ctx);
			await service.editPrompt(sessionId);
		},
	});

	pi.registerCommand(ExtensionCommand.DELETE, {
		description: EXTENSION_COMMAND_CATALOG[ExtensionCommand.DELETE].description,
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const sessionId = bindHost(ctx);
			await service.deletePrompt(sessionId);
		},
	});

	pi.registerCommand(ExtensionCommand.MODE, {
		description: EXTENSION_COMMAND_CATALOG[ExtensionCommand.MODE].description,
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const sessionId = bindHost(ctx);
			const clean = args.trim().toLowerCase();
			if (clean === "append" || clean === "replace") {
				await service.toggleMode(sessionId, clean as MergeMode);
			} else if (clean === "" || clean === "toggle") {
				await service.toggleMode(sessionId);
			} else {
				ctx.ui.notify(
					`Usage: ${EXTENSION_COMMAND_CATALOG[ExtensionCommand.MODE].usage}`,
					"error",
				);
			}
		},
	});

	pi.registerCommand(ExtensionCommand.INFO, {
		description: EXTENSION_COMMAND_CATALOG[ExtensionCommand.INFO].description,
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const sessionId = bindHost(ctx);
			const config = await service.getCurrentConfig(sessionId);
			const files = await storage.list();
			const paths = resolveHostPaths(ctx.cwd);

			const activeList: ActivePromptRef[] =
				config.activePrompts && config.activePrompts.length > 0
					? config.activePrompts
					: config.file
						? [
								{
									name: config.file,
									scope: resolveScope(config.scope, paths.host),
								},
							]
						: [];

			let activeSize = 0;
			for (const p of activeList) {
				const content = await storage.read(p.name, p.scope);
				activeSize += content?.length ?? 0;
			}

			const promptFileLabel =
				activeList.length > 0
					? activeList.map((p) => `[${formatScope(p.scope)}] ${p.name}`).join(" + ")
					: "(None / Default)";
			const lines = [
				"--- System Prompt Switch ---",
				`Host:             ${paths.host.toUpperCase()}`,
				`Session ID:       ${sessionId}`,
				`Prompt File:      ${promptFileLabel}`,
				`Mode:             ${config.mode}`,
				`Enabled:          ${config.enabled}`,
				`Prompt Size:      ${activeSize} chars`,
				`OMP Directory:    ${storage.getGlobalDirectory(PromptScope.GlobalOmp)}`,
				`PI Directory:     ${storage.getGlobalDirectory(PromptScope.GlobalPi)}`,
				`Local Directory:  ${storage.getLocalDirectory()}`,
				`Available:        ${files.length > 0 ? files.map((f) => `[${formatScope(f.scope)}] ${f.name}`).join(", ") : "(none)"}`,
			];

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
	pi.registerCommand(ExtensionCommand.PATH, {
		description: EXTENSION_COMMAND_CATALOG[ExtensionCommand.PATH].description,
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const sessionId = bindHost(ctx);
			const lines = await service.getPathsSummary(sessionId);
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	pi.registerCommand(ExtensionCommand.LOGS, {
		description: EXTENSION_COMMAND_CATALOG[ExtensionCommand.LOGS].description,
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			bindHost(ctx);
			const lines = parseInt(args.trim(), 10) || 20;
			const recent = logger.getRecent(lines);
			const output = [
				"=== System Prompt Switch Logs ===",
				`Log file: ${logger.getLogPath()}`,
				`Live tail: tail -f "${logger.getLogPath()}"`,
				"---------------------------------",
				...recent,
			];
			ctx.ui.notify(output.join("\n"), "info");
		},
	});

	// --- Lifecycle Hooks ---

	pi.on("session_start", (event: SessionStartEvent, ctx: ExtensionContext) => {
		const sessionId = bindHost(ctx);
		logger.info("SESSION_START", "session_start event received", {
			reason: event.reason,
			sessionId,
		});
		// ponytail: only ask on a genuinely fresh session. Treating a missing
		// reason as "new" made every resume re-ask; resume/reload/fork just
		// refresh the widget, and the service's `decided` flag makes a second
		// startup on the same session silent too.
		if (event.reason === "startup" || event.reason === "new") {
			// Detach modal from event watchdog so user dialogs have unlimited time
			void service.promptNewSessionModal(sessionId);
		} else {
			void service.updateStatus(sessionId);
		}
	});

	pi.on("session_shutdown", (_event, ctx: ExtensionContext) => {
		logger.info("SESSION_SHUTDOWN", "session_shutdown event received");
		if (ctx.hasUI) {
			uiAdapter.setHost(ctx);
			uiAdapter.setWidget(undefined);
		}
	});

	// --- System Prompt Injection ---

	pi.on(
		"before_agent_start",
		async (
			event: BeforeAgentStartEvent,
			ctx: ExtensionContext,
		): Promise<BeforeAgentStartEventResult | void> => {
			const sessionId = bindHost(ctx);
			const opts = event.systemPromptOptions;

			const resolvedPrompt = await service.resolvePromptForTurn(sessionId, {
				basePrompt: event.systemPrompt,
				tools: (opts?.toolSnippets as Record<string, string>) ?? {},
				appendSystemPrompt: opts?.appendSystemPrompt,
				contextFiles: opts?.contextFiles as Array<{ path: string; content: string }>,
				skills: opts?.skills as Array<{
					name: string;
					description: string;
					filePath: string;
					disableModelInvocation?: boolean;
				}>,
				cwd: opts?.cwd ?? ctx.cwd,
			});

			if (resolvedPrompt !== event.systemPrompt) {
				return { systemPrompt: resolvedPrompt };
			}
		},
	);
}
