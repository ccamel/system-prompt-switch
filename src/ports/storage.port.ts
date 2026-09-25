import type { PromptFileInfo } from "../core/types/prompt-file-info.type";
import type { PromptScope } from "../core/types/prompt-scope.type";

export interface StoragePort {
	list(): Promise<PromptFileInfo[]>;
	read(name: string, scope?: PromptScope): Promise<string | null>;
	write(name: string, content: string, scope?: PromptScope): Promise<void>;
	delete(name: string, scope?: PromptScope): Promise<boolean>;
	getGlobalDirectory(): string;
	getLocalDirectory(): string;
	setCwd(cwd: string): void;
}
