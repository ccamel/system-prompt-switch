import type { HostPlatform } from "./host-platform.type";

export interface HostPaths {
	host: HostPlatform;
	globalPromptDir: string;
	localPromptDir: string;
	statePath: string;
}
