import * as os from "node:os";
import * as path from "node:path";
import type { HostPaths } from "./types/host-paths.type";
import type { HostPlatform } from "./types/host-platform.type";

export function detectHost(
	env: Record<string, string | undefined> = process.env,
	argv: string[] = process.argv,
): HostPlatform {
	if (env.OMPCODE === "1") {
		return "omp";
	}
	const hasOmpInArgv = argv.some((arg) => {
		const base = path.basename(arg);
		return base === "omp" || base.startsWith("omp-");
	});
	if (hasOmpInArgv) {
		return "omp";
	}
	return "pi";
}

export function resolveHostPaths(
	cwd: string = process.cwd(),
	env: Record<string, string | undefined> = process.env,
	argv: string[] = process.argv,
): HostPaths {
	const host = detectHost(env, argv);
	const home = os.homedir();

	const envGlobalDir = env.SPS_PROMPT_DIR?.trim() || env.SYSTEM_PROMPT_DIR?.trim();
	const globalPromptDir =
		envGlobalDir && envGlobalDir.length > 0
			? envGlobalDir
			: path.join(
					home,
					host === "omp" ? ".omp" : ".pi",
					"agent",
					"system-prompts-switch",
				);

	const envLocalDir = env.SPS_LOCAL_PROMPT_DIR?.trim();
	const localPromptDir =
		envLocalDir && envLocalDir.length > 0
			? envLocalDir
			: path.join(cwd, ".agents", "system-prompts-switch");

	const envStatePath =
		env.SPS_STATE_PATH?.trim() || env.PI_SYSTEM_PROMPT_STATE_PATH?.trim();
	const statePath =
		envStatePath && envStatePath.length > 0
			? envStatePath
			: path.join(
					home,
					host === "omp" ? ".omp" : ".pi",
					"agent",
					"state",
					"system-prompt-switch",
					"sessions.json",
				);

	return {
		host,
		globalPromptDir,
		localPromptDir,
		statePath,
	};
}
