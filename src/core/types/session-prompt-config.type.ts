import type { ActivePromptRef } from "./active-prompt-ref.type";
import type { MergeMode } from "./merge-mode.type";
import type { PromptScope } from "./prompt-scope.type";

export interface SessionPromptConfig {
	file: string | null;
	scope?: PromptScope;
	activePrompts: ActivePromptRef[];
	mode: MergeMode;
	enabled: boolean;
}
