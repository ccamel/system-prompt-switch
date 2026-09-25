import type { ContextFileItem } from "./context-file-item.type";
import type { MergeMode } from "./merge-mode.type";
import type { PromptScope } from "./prompt-scope.type";
import type { SkillItem } from "./skill-item.type";

export interface CustomPromptChunk {
	name?: string;
	scope?: PromptScope;
	content: string;
}

export interface BuildPromptInput {
	basePrompt: string;
	customPrompt?: string | null;
	customPrompts?: CustomPromptChunk[];
	mode: MergeMode;
	tools?: Record<string, string>;
	appendSystemPrompt?: string;
	contextFiles?: ContextFileItem[];
	skills?: SkillItem[];
	cwd?: string;
	now?: Date;
}
