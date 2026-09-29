import { HostPlatform } from "./types/host-platform.type";
import { globalScopeFor, PromptScope } from "./types/prompt-scope.type";

/** Short labels shown in the modals, the widget, and the built prompt. */
export const SCOPE_BY_LABEL: Record<string, PromptScope> = {
	local: PromptScope.Local,
	omp: PromptScope.GlobalOmp,
	pi: PromptScope.GlobalPi,
};

const LABEL_BY_SCOPE: Record<PromptScope, string> = {
	[PromptScope.Local]: "local",
	[PromptScope.GlobalOmp]: "omp",
	[PromptScope.GlobalPi]: "pi",
};

/** Render a scope the way the UI shows it. */
export function formatScope(scope: PromptScope | string): string {
	return LABEL_BY_SCOPE[scope as PromptScope] ?? String(scope);
}

/**
 * Map a scope read from persisted JSON onto a host-explicit one. Anything that
 * is not already explicit — including the bare "global" older sessions wrote —
 * resolves to the detected host.
 */
export function resolveScope(
	scope: PromptScope | string | undefined,
	host: HostPlatform,
): PromptScope {
	if (scope === PromptScope.GlobalOmp || scope === PromptScope.GlobalPi) {
		return scope;
	}
	if (scope === PromptScope.Local) {
		return PromptScope.Local;
	}
	return globalScopeFor(host);
}
