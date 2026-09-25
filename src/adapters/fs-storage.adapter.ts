import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { PromptFileInfo } from "../core/types";
import type { StoragePort } from "../ports/storage.port";

export class FsStorageAdapter implements StoragePort {
	private readonly dir: string;

	constructor(customDir?: string) {
		const envDir = process.env.PI_SYSTEM_PROMPT_DIR?.trim();
		this.dir =
			customDir ??
			(envDir && envDir.length > 0
				? envDir
				: path.join(os.homedir(), ".pi", "agent", "system-prompts"));
	}

	getDirectory(): string {
		return this.dir;
	}

	private ensureDir(): void {
		if (!fs.existsSync(this.dir)) {
			fs.mkdirSync(this.dir, { recursive: true });
		}
	}

	async list(): Promise<PromptFileInfo[]> {
		try {
			if (!fs.existsSync(this.dir)) return [];
			const entries = fs.readdirSync(this.dir, { withFileTypes: true });
			const files: PromptFileInfo[] = [];

			for (const entry of entries) {
				if (entry.isFile() && entry.name.endsWith(".md")) {
					const fullPath = path.join(this.dir, entry.name);
					try {
						const stat = fs.statSync(fullPath);
						files.push({
							name: entry.name,
							path: fullPath,
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

	async read(name: string): Promise<string | null> {
		try {
			const fullPath = path.join(this.dir, path.basename(name));
			if (!fs.existsSync(fullPath)) return null;
			return fs.readFileSync(fullPath, "utf-8");
		} catch {
			return null;
		}
	}

	async write(name: string, content: string): Promise<void> {
		this.ensureDir();
		const fullPath = path.join(this.dir, path.basename(name));
		fs.writeFileSync(fullPath, content, "utf-8");
	}

	async delete(name: string): Promise<boolean> {
		try {
			const fullPath = path.join(this.dir, path.basename(name));
			if (!fs.existsSync(fullPath)) return false;
			fs.unlinkSync(fullPath);
			return true;
		} catch {
			return false;
		}
	}
}
