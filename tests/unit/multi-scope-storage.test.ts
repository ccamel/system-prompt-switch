import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { FsStorageAdapter } from "../../src/adapters/fs-storage.adapter";

describe("FsStorageAdapter Multi-Scope", () => {
	let tempDir: string;
	let globalDir: string;
	let localDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sps-storage-test-"));
		globalDir = path.join(tempDir, "global-prompts");
		localDir = path.join(tempDir, "local-repo", ".agents", "system-prompts-switch");

		fs.mkdirSync(globalDir, { recursive: true });
		fs.mkdirSync(localDir, { recursive: true });

		fs.writeFileSync(
			path.join(globalDir, "global-coder.md"),
			"Global coder instructions",
			"utf-8",
		);
		fs.writeFileSync(
			path.join(localDir, "local-rules.md"),
			"Local repo instructions",
			"utf-8",
		);
	});

	afterEach(() => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup
		}
	});

	it("lists prompts from both local and global scopes with correct tags", async () => {
		const adapter = new FsStorageAdapter({ globalDir, localDir });
		const files = await adapter.list();

		expect(files.length).toBe(2);

		const localFile = files.find((f) => f.name === "local-rules.md");
		expect(localFile).toBeDefined();
		expect(localFile?.scope).toBe("local");

		const globalFile = files.find((f) => f.name === "global-coder.md");
		expect(globalFile).toBeDefined();
		expect(globalFile?.scope).toBe("global");
	});

	it("reads prompts using scope or auto-lookup", async () => {
		const adapter = new FsStorageAdapter({ globalDir, localDir });

		const localDirect = await adapter.read("local-rules.md", "local");
		expect(localDirect).toBe("Local repo instructions");

		const globalDirect = await adapter.read("global-coder.md", "global");
		expect(globalDirect).toBe("Global coder instructions");

		const autoLocal = await adapter.read("local-rules.md");
		expect(autoLocal).toBe("Local repo instructions");

		const autoGlobal = await adapter.read("global-coder.md");
		expect(autoGlobal).toBe("Global coder instructions");
	});

	it("writes to the targeted scope and isolates them", async () => {
		const adapter = new FsStorageAdapter({ globalDir, localDir });

		await adapter.write("shared.md", "I am in local", "local");
		await adapter.write("shared.md", "I am in global", "global");

		const readLocal = await adapter.read("shared.md", "local");
		expect(readLocal).toBe("I am in local");

		const readGlobal = await adapter.read("shared.md", "global");
		expect(readGlobal).toBe("I am in global");
	});

	it("deletes from the targeted scope without deleting the other", async () => {
		const adapter = new FsStorageAdapter({ globalDir, localDir });

		await adapter.write("duplicate.md", "Local version", "local");
		await adapter.write("duplicate.md", "Global version", "global");

		// Delete only from local
		const deleted = await adapter.delete("duplicate.md", "local");
		expect(deleted).toBe(true);

		// Local should be gone
		expect(await adapter.read("duplicate.md", "local")).toBeNull();
		// Global should still exist
		expect(await adapter.read("duplicate.md", "global")).toBe("Global version");
	});
});
