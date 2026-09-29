import type { ActivePromptRef } from "./active-prompt-ref.type";
import type { MergeMode } from "./merge-mode.type";
import type { PromptScope } from "./prompt-scope.type";

export interface SessionPromptConfig {
	file: string | null;
	scope?: PromptScope;
	activePrompts?: ActivePromptRef[];
	mode: MergeMode;
	enabled: boolean;
	// ponytail: true once the user has answered the session-start prompt modal
	// (including by dismissing it and choosing (None)). This is what makes a
	// resume silent: inferring "already answered" from activePrompts.length
	// cannot tell "chose None" apart from "never asked".
	decided?: boolean;
}
