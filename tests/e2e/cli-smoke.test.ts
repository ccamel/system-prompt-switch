import { describe, expect, it } from "bun:test";

describe("CLI Smoke Test", () => {
	it("loads extension cleanly via pi CLI without errors", async () => {
		// ponytail: spawn whichever host binary is on PATH; omp and pi share the same
		// extension loader (-e <path>). Default to `pi` for upstream parity.
		const binary = Bun.which("pi") ? "pi" : "omp";
		const proc = Bun.spawn(
			[binary, "-e", "./extensions/index.ts", "--help"],
			{
				stdout: "pipe",
				stderr: "pipe",
			},
		);

		const stderr = await new Response(proc.stderr).text();
		const exitCode = await proc.exited;

		expect(exitCode).toBe(0);
		// stderr should not contain fatal extension crash logs
		expect(stderr).not.toContain("Error: Cannot find module");
		expect(stderr).not.toContain("SyntaxError");
	});
});
