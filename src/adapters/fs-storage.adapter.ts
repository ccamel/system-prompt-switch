import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveHostPaths } from "../core/paths";
import type { PromptFileInfo } from "../core/types/prompt-file-info.type";
import type { PromptScope } from "../core/types/prompt-scope.type";
import type { StoragePort } from "../ports/storage.port";

export interface FsStorageOptions {
	globalDir?: string;
	localDir?: string;
	cwd?: string;
}

export class FsStorageAdapter implements StoragePort {
	private globalDir: string;
	private localDir: string;

	constructor(options?: FsStorageOptions) {
		const resolved = resolveHostPaths(options?.cwd);
		this.globalDir = options?.globalDir ?? resolved.globalPromptDir;
		this.localDir = options?.localDir ?? resolved.localPromptDir;
	}

	setCwd(cwd: string): void {
		const resolved = resolveHostPaths(cwd);
		this.localDir = resolved.localPromptDir;
	}

	getGlobalDirectory(): string {
		return this.globalDir;
	}

	getLocalDirectory(): string {
		return this.localDir;
	}

	private ensureDir(dirPath: string): void {
		if (!fs.existsSync(dirPath)) {
			fs.mkdirSync(dirPath, { recursive: true });
		}
	}

	private migrateLegacyPromptsIfNeeded(): void {
		try {
			this.ensureDir(this.globalDir);
			const current = fs
				.readdirSync(this.globalDir)
				.filter((f) => f.endsWith(".md"));
			if (current.length > 0) {
				return;
			}

			const legacyDir = path.join(
				os.homedir(),
				".pi",
				"agent",
				"system-prompts",
			);
			if (!fs.existsSync(legacyDir)) {
				return;
			}

			const legacyFiles = fs
				.readdirSync(legacyDir)
				.filter((f) => f.endsWith(".md"));
			for (const file of legacyFiles) {
				const src = path.join(legacyDir, file);
				const dest = path.join(this.globalDir, file);
				if (!fs.existsSync(dest)) {
					fs.copyFileSync(src, dest);
				}
			}
		} catch {
			// best-effort migration
		}
	}

	private readDirFiles(dirPath: string, scope: PromptScope): PromptFileInfo[] {
		if (!fs.existsSync(dirPath)) return [];
		try {
			const entries = fs.readdirSync(dirPath, { withFileTypes: true });
			const files: PromptFileInfo[] = [];

			for (const entry of entries) {
				if (entry.isFile() && entry.name.endsWith(".md")) {
					const fullPath = path.join(dirPath, entry.name);
					try {
						const stat = fs.statSync(fullPath);
						files.push({
							name: entry.name,
							path: fullPath,
							scope,
							sizeChars: stat.size,
							modifiedAt: stat.mtimeMs,
						});
					} catch {
						// ignore unreadable file
					}
				}
			}

			return files.sort((a, b) => a.name.localeCompare(b.name));
		} catch {
			return [];
		}
	}

	async list(): Promise<PromptFileInfo[]> {
		this.migrateLegacyPromptsIfNeeded();

		const localFiles = this.readDirFiles(this.localDir, "local");
		const globalFiles = this.readDirFiles(this.globalDir, "global");

		return [...localFiles, ...globalFiles];
	}

	async read(name: string, scope?: PromptScope): Promise<string | null> {
		const cleanName = path.basename(name);

		if (scope === "local") {
			return this.readFileFrom(path.join(this.localDir, cleanName));
		}
		if (scope === "global") {
			return this.readFileFrom(path.join(this.globalDir, cleanName));
		}

		// If no scope specified, check local first, then global
		const localContent = this.readFileFrom(path.join(this.localDir, cleanName));
		if (localContent !== null) return localContent;

		return this.readFileFrom(path.join(this.globalDir, cleanName));
	}

	private readFileFrom(filePath: string): string | null {
		try {
			if (!fs.existsSync(filePath)) return null;
			return fs.readFileSync(filePath, "utf-8");
		} catch {
			return null;
		}
	}

	async write(
		name: string,
		content: string,
		scope: PromptScope = "global",
	): Promise<void> {
		const targetDir = scope === "local" ? this.localDir : this.globalDir;
		this.ensureDir(targetDir);
		const fullPath = path.join(targetDir, path.basename(name));
		fs.writeFileSync(fullPath, content, "utf-8");
	}

	async delete(name: string, scope?: PromptScope): Promise<boolean> {
		const cleanName = path.basename(name);

		if (scope === "local") {
			return this.unlinkFile(path.join(this.localDir, cleanName));
		}
		if (scope === "global") {
			return this.unlinkFile(path.join(this.globalDir, cleanName));
		}

		// Try local then global
		const deletedLocal = this.unlinkFile(path.join(this.localDir, cleanName));
		if (deletedLocal) return true;

		return this.unlinkFile(path.join(this.globalDir, cleanName));
	}

	private unlinkFile(filePath: string): boolean {
		try {
			if (!fs.existsSync(filePath)) return false;
			fs.unlinkSync(filePath);
			return true;
		} catch {
			return false;
		}
	}
}
