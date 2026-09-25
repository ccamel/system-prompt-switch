import type { PromptScope } from "./prompt-scope.type";

export interface PromptFileInfo {
	name: string;
	path: string;
	scope: PromptScope;
	sizeChars: number;
	modifiedAt: number;
}
