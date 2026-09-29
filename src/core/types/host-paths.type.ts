import type { HostPlatform } from "./host-platform.type";

export interface HostPaths {
	host: HostPlatform;
	/** Prompt dir for the detected host. Kept for callers that have no scope. */
	globalPromptDir: string;
	/** Both hosts are always resolved, regardless of `host`. */
	ompGlobalPromptDir: string;
	piGlobalPromptDir: string;
	localPromptDir: string;
	statePath: string;
}
