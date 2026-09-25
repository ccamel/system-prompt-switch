export type MergeMode = "append" | "replace";

export interface SessionPromptConfig {
	file: string | null;
	mode: MergeMode;
	enabled: boolean;
}

export interface PromptFileInfo {
	name: string;
	path: string;
	sizeChars: number;
	modifiedAt: number;
}

export interface SkillItem {
	name: string;
	description: string;
	filePath: string;
	disableModelInvocation?: boolean;
}

export interface ContextFileItem {
	path: string;
	content: string;
}

export interface BuildPromptInput {
	basePrompt: string;
	customPrompt: string | null;
	mode: MergeMode;
	tools?: Record<string, string>;
	appendSystemPrompt?: string;
	contextFiles?: ContextFileItem[];
	skills?: SkillItem[];
	cwd?: string;
	now?: Date;
}
