import type { PromptFileInfo } from "../core/types";

export interface StoragePort {
	list(): Promise<PromptFileInfo[]>;
	read(name: string): Promise<string | null>;
	write(name: string, content: string): Promise<void>;
	delete(name: string): Promise<boolean>;
	getDirectory(): string;
}
