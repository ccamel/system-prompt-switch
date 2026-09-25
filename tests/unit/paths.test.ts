import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "bun:test";
import { detectHost, resolveHostPaths } from "../../src/core/paths";

describe("paths", () => {
	it("detects omp host when OMPCODE=1", () => {
		expect(detectHost({ OMPCODE: "1" }, ["node"])).toBe("omp");
	});

	it("detects omp host when argv includes omp binary", () => {
		expect(detectHost({}, ["/usr/local/bin/omp", "run"])).toBe("omp");
	});

	it("defaults to pi host when neither OMPCODE nor omp argv is set", () => {
		expect(detectHost({}, ["node", "pi.js"])).toBe("pi");
	});

	it("resolves omp directories to .omp/agent/", () => {
		const paths = resolveHostPaths("/test/project", { OMPCODE: "1" }, []);
		const home = os.homedir();

		expect(paths.host).toBe("omp");
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

		expect(paths.host).toBe("pi");
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
});
