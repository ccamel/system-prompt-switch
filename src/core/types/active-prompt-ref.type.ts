import type { PromptScope } from "./prompt-scope.type";

export interface ActivePromptRef {
	name: string;
	scope: PromptScope;
}
