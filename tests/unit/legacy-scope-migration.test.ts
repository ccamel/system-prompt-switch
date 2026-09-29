import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { SessionStateAdapter } from "../../src/adapters/session-state.adapter";
import { PromptScope } from "../../src/core/types/prompt-scope.type";
import type { SessionPromptConfig } from "../../src/core/types/session-prompt-config.type";

/**
 * Older sessions persisted a bare "global" scope, which meant "whatever host we
 * detected". Scopes are now host-explicit, so a legacy value is migrated on read
 * and the file is rewritten, leaving no ambiguous value behind for anyone.
 */
describe("legacy scope migration", () => {
	let tempDir: string;
	let statePath: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sps-migrate-"));
		statePath = path.join(tempDir, "sessions.json");
	});

	afterEach(() => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup
		}
	});

	function writeState(entries: Record<string, SessionPromptConfig>): void {
		fs.writeFileSync(statePath, JSON.stringify(entries, null, 2), "utf-8");
	}

	function readState(): Record<string, unknown> {
		return JSON.parse(fs.readFileSync(statePath, "utf-8"));
	}

	it("rewrites a bare 'global' scope to the detected host on read", async () => {
		writeState({
			sess: {
				file: "beh.md",
				scope: "global",
				activePrompts: [{ name: "beh.md", scope: "global" }],
				mode: "append",
				enabled: true,
			} as unknown as SessionPromptConfig,
		});

		const adapter = new SessionStateAdapter(statePath);
		const config = await adapter.getSessionConfig("sess");

		expect(config?.scope).toBe(PromptScope.GlobalOmp);
		expect(config?.activePrompts?.[0].scope).toBe(PromptScope.GlobalOmp);
	});

	it("persists the migrated value so the file holds no bare 'global'", async () => {
		writeState({
			sess: {
				file: "beh.md",
				scope: "global",
				activePrompts: [{ name: "beh.md", scope: "global" }],
				mode: "append",
				enabled: true,
			} as unknown as SessionPromptConfig,
		});

		const adapter = new SessionStateAdapter(statePath);
		await adapter.getSessionConfig("sess");

		const onDisk = readState().sess as SessionPromptConfig;
		expect(JSON.stringify(onDisk)).not.toContain('"global"');
		expect(onDisk.scope).toBe(PromptScope.GlobalOmp);
	});

	it("migrates every entry in the file, not just the one requested", async () => {
		writeState({
			one: {
				file: "a.md",
				scope: "global",
				activePrompts: [{ name: "a.md", scope: "global" }],
				mode: "append",
				enabled: true,
			} as unknown as SessionPromptConfig,
			two: {
				file: "b.md",
				scope: "global",
				activePrompts: [{ name: "b.md", scope: "global" }],
				mode: "append",
				enabled: true,
			} as unknown as SessionPromptConfig,
			three: {
				file: "c.md",
				scope: "local",
				activePrompts: [{ name: "c.md", scope: "local" }],
				mode: "append",
				enabled: true,
			} as unknown as SessionPromptConfig,
		});

		const adapter = new SessionStateAdapter(statePath);
		await adapter.getSessionConfig("one");

		const onDisk = readState();
		expect(JSON.stringify(onDisk)).not.toContain('"global"');
		expect((onDisk.two as SessionPromptConfig).scope).toBe(PromptScope.GlobalOmp);
		expect((onDisk.three as SessionPromptConfig).scope).toBe(PromptScope.Local);
	});

	it("leaves already-explicit scopes untouched", async () => {
		writeState({
			sess: {
				file: "beh.md",
				scope: PromptScope.GlobalPi,
				activePrompts: [{ name: "beh.md", scope: PromptScope.GlobalPi }],
				mode: "append",
				enabled: true,
			},
		});

		const adapter = new SessionStateAdapter(statePath);
		const config = await adapter.getSessionConfig("sess");

		expect(config?.scope).toBe(PromptScope.GlobalPi);
		expect(readState().sess).toEqual({
			file: "beh.md",
			scope: PromptScope.GlobalPi,
			activePrompts: [{ name: "beh.md", scope: PromptScope.GlobalPi }],
			mode: "append",
			enabled: true,
		});
	});

	it("does not rewrite the file when nothing needs migrating", async () => {
		writeState({
			sess: {
				file: "beh.md",
				scope: PromptScope.Local,
				activePrompts: [{ name: "beh.md", scope: PromptScope.Local }],
				mode: "append",
				enabled: true,
			},
		});
		const before = fs.statSync(statePath).mtimeMs;

		const adapter = new SessionStateAdapter(statePath);
		await adapter.getSessionConfig("sess");

		expect(fs.statSync(statePath).mtimeMs).toBe(before);
	});
});
