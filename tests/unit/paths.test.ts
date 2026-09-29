import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "bun:test";
import { detectHost, resolveHostPaths } from "../../src/core/paths";
import { HostPlatform } from "../../src/core/types/host-platform.type";

describe("paths", () => {
	it("detects omp host when OMPCODE=1", () => {
		expect(detectHost({ OMPCODE: "1" }, ["node"])).toBe(HostPlatform.Omp);
	});

	it("detects omp host when argv includes omp binary", () => {
		expect(detectHost({}, ["/usr/local/bin/omp", "run"])).toBe(HostPlatform.Omp);
	});

	it("defaults to pi host when neither OMPCODE nor omp argv is set", () => {
		expect(detectHost({}, ["node", "pi.js"])).toBe(HostPlatform.Pi);
	});

	it("resolves omp directories to .omp/agent/", () => {
		const paths = resolveHostPaths("/test/project", { OMPCODE: "1" }, []);
		const home = os.homedir();

		expect(paths.host).toBe(HostPlatform.Omp);
		expect(paths.globalPromptDir).toBe(
			path.join(home, ".omp", "agent", "system-prompts-switch"),
		);
		expect(paths.localPromptDir).toBe(
			path.join("/test/project", ".agents", "system-prompts-switch"),
		);
		expect(paths.statePath).toBe(
			path.join(
				home,
				".omp",
				"agent",
				"state",
				"system-prompt-switch",
				"sessions.json",
			),
		);
	});

	it("resolves pi directories to .pi/agent/", () => {
		const paths = resolveHostPaths("/test/project", {}, []);
		const home = os.homedir();

		expect(paths.host).toBe(HostPlatform.Pi);
		expect(paths.globalPromptDir).toBe(
			path.join(home, ".pi", "agent", "system-prompts-switch"),
		);
		expect(paths.localPromptDir).toBe(
			path.join("/test/project", ".agents", "system-prompts-switch"),
		);
		expect(paths.statePath).toBe(
			path.join(
				home,
				".pi",
				"agent",
				"state",
				"system-prompt-switch",
				"sessions.json",
			),
		);
	});

	it("respects environment variable overrides", () => {
		const paths = resolveHostPaths("/test/project", {
			SPS_PROMPT_DIR: "/custom/global/prompts",
			SPS_LOCAL_PROMPT_DIR: "/custom/local/prompts",
			SPS_STATE_PATH: "/custom/state/sessions.json",
		});

		expect(paths.globalPromptDir).toBe("/custom/global/prompts");
		expect(paths.localPromptDir).toBe("/custom/local/prompts");
		expect(paths.statePath).toBe("/custom/state/sessions.json");
	});

	// --- Bug 2: both global dirs are always resolved, plus an explicit host override ---

	it("resolves BOTH global dirs regardless of the detected host", () => {
		const home = os.homedir();
		for (const env of [{ OMPCODE: "1" }, {}]) {
			const paths = resolveHostPaths("/test/project", env, []);
			expect(paths.ompGlobalPromptDir).toBe(
				path.join(home, ".omp", "agent", "system-prompts-switch"),
			);
			expect(paths.piGlobalPromptDir).toBe(
				path.join(home, ".pi", "agent", "system-prompts-switch"),
			);
		}
	});

	it("SPS_HOST forces the detected host and wins over OMPCODE", () => {
		expect(detectHost({ SPS_HOST: "pi", OMPCODE: "1" }, [])).toBe(HostPlatform.Pi);
		expect(detectHost({ SPS_HOST: "omp" }, [])).toBe(HostPlatform.Omp);
	});

	it("ignores a bogus SPS_HOST value", () => {
		expect(detectHost({ SPS_HOST: "nonsense", OMPCODE: "1" }, [])).toBe(HostPlatform.Omp);
	});
});
