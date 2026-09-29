import type { HostPlatform } from "./host-platform.type";

// ponytail: `global` used to mean "whatever host we detected", which silently
// wrote prompts into ~/.pi while running omp. Naming the host explicitly makes
// the destination unambiguous and is what the modals show the user. Any bare
// "global" still found in a persisted session is rewritten on read by
// SessionStateAdapter, so it never reaches the rest of the code.
export enum PromptScope {
	Local = "local",
	GlobalOmp = "global-omp",
	GlobalPi = "global-pi",
}

/** The scope that targets a given host's global prompt directory. */
export function globalScopeFor(host: HostPlatform): PromptScope {
	return host === "omp" ? PromptScope.GlobalOmp : PromptScope.GlobalPi;
}
