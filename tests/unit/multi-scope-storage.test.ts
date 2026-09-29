import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { FsStorageAdapter } from "../../src/adapters/fs-storage.adapter";
import { PromptScope } from "../../src/core/types/prompt-scope.type";

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
		expect(localFile?.scope).toBe(PromptScope.Local);

		const globalFile = files.find((f) => f.name === "global-coder.md");
		expect(globalFile).toBeDefined();
		// The legacy `globalDir` option maps onto the detected host.
		expect(globalFile?.scope).toBe(
			process.env.OMPCODE === "1"
				? PromptScope.GlobalOmp
				: PromptScope.GlobalPi,
		);
	});

	it("reads prompts using scope or auto-lookup", async () => {
		const adapter = new FsStorageAdapter({ globalDir, localDir });
		const globalScope =
			process.env.OMPCODE === "1" ? PromptScope.GlobalOmp : PromptScope.GlobalPi;

		const localDirect = await adapter.read("local-rules.md", PromptScope.Local);
		expect(localDirect).toBe("Local repo instructions");

		const globalDirect = await adapter.read("global-coder.md", globalScope);
		expect(globalDirect).toBe("Global coder instructions");

		const autoLocal = await adapter.read("local-rules.md");
		expect(autoLocal).toBe("Local repo instructions");

		const autoGlobal = await adapter.read("global-coder.md");
		expect(autoGlobal).toBe("Global coder instructions");
	});

	it("writes to the targeted scope and isolates them", async () => {
		const adapter = new FsStorageAdapter({ globalDir, localDir });
		const globalScope =
			process.env.OMPCODE === "1" ? PromptScope.GlobalOmp : PromptScope.GlobalPi;

		await adapter.write("shared.md", "I am in local", PromptScope.Local);
		await adapter.write("shared.md", "I am in global", globalScope);

		const readLocal = await adapter.read("shared.md", PromptScope.Local);
		expect(readLocal).toBe("I am in local");

		const readGlobal = await adapter.read("shared.md", globalScope);
		expect(readGlobal).toBe("I am in global");
	});

	it("deletes from the targeted scope without deleting the other", async () => {
		const adapter = new FsStorageAdapter({ globalDir, localDir });

		await adapter.write("duplicate.md", "Local version", PromptScope.Local);
		await adapter.write("duplicate.md", "Global version", PromptScope.GlobalOmp);

		// Delete only from local
		const deleted = await adapter.delete("duplicate.md", PromptScope.Local);
		expect(deleted).toBe(true);

		// Local should be gone
		expect(await adapter.read("duplicate.md", PromptScope.Local)).toBeNull();
		// Global should still exist
		expect(await adapter.read("duplicate.md", PromptScope.GlobalOmp)).toBe(
			"Global version",
		);
	});

	// --- Bug 2: global splits into explicit global-omp and global-pi ---

	describe("three-scope storage (local / global-omp / global-pi)", () => {
		let ompDir: string;
		let piDir: string;
		let adapter: FsStorageAdapter;

		beforeEach(() => {
			ompDir = path.join(tempDir, "omp-prompts");
			piDir = path.join(tempDir, "pi-prompts");
			fs.mkdirSync(ompDir, { recursive: true });
			fs.mkdirSync(piDir, { recursive: true });
			adapter = new FsStorageAdapter({
				ompGlobalDir: ompDir,
				piGlobalDir: piDir,
				localDir,
			});

			fs.writeFileSync(path.join(ompDir, "omp-only.md"), "from omp", "utf-8");
			fs.writeFileSync(path.join(piDir, "pi-only.md"), "from pi", "utf-8");
		});

		it("writes each global scope to its own host directory", async () => {
			await adapter.write("targeted.md", "written to omp", PromptScope.GlobalOmp);
			await adapter.write("targeted.md", "written to pi", PromptScope.GlobalPi);

			expect(fs.readFileSync(path.join(ompDir, "targeted.md"), "utf-8")).toBe(
				"written to omp",
			);
			expect(fs.readFileSync(path.join(piDir, "targeted.md"), "utf-8")).toBe(
				"written to pi",
			);
		});

		it("lists files from all three scopes with correct scope tags", async () => {
			const files = await adapter.list();

			const byName = new Map(files.map((f) => [`${f.scope}:${f.name}`, f]));
			expect(byName.get("global-omp:omp-only.md")).toBeDefined();
			expect(byName.get("global-pi:pi-only.md")).toBeDefined();
			expect(byName.get("local:local-rules.md")).toBeDefined();
		});

		it("reads each global scope from its own host directory", async () => {
			expect(await adapter.read("omp-only.md", PromptScope.GlobalOmp)).toBe("from omp");
			expect(await adapter.read("pi-only.md", PromptScope.GlobalPi)).toBe("from pi");
		});

		it("deletes only from the targeted global scope", async () => {
			await adapter.write("dup.md", "omp copy", PromptScope.GlobalOmp);
			await adapter.write("dup.md", "pi copy", PromptScope.GlobalPi);

			expect(await adapter.delete("dup.md", PromptScope.GlobalPi)).toBe(true);
			expect(await adapter.read("dup.md", PromptScope.GlobalPi)).toBeNull();
			expect(await adapter.read("dup.md", PromptScope.GlobalOmp)).toBe("omp copy");
		});

		it("exposes each global directory for display", async () => {
			expect(await adapter.getGlobalDirectory(PromptScope.GlobalOmp)).toBe(ompDir);
			expect(await adapter.getGlobalDirectory(PromptScope.GlobalPi)).toBe(piDir);
			expect(await adapter.getGlobalDirectory()).toBe(ompDir);
		});
	});
});
