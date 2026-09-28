import type { PromptScope } from "./prompt-scope.type";

export interface ActivePromptRef {
	name: string;
	scope: PromptScope;
	// ponytail: true when this entry was pushed by /sps-inject and must be
	// consumed (removed) after the next resolvePromptForTurn. Omitted on
	// entries that are permanent (selected via /sps-select).
	injected?: boolean;
}
