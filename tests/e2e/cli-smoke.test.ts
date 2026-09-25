import { describe, expect, it } from "bun:test";

describe("CLI Smoke Test", () => {
	it("loads extension cleanly via pi CLI without errors", async () => {
		const proc = Bun.spawn(
			["pi", "-e", "./extensions/index.ts", "--help"],
			{
				stdout: "pipe",
				stderr: "pipe",
			},
		);

		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();
		const exitCode = await proc.exited;

		expect(exitCode).toBe(0);
		expect(stdout).toContain("pi [options]");
		// stderr should not contain fatal extension crash logs
		expect(stderr).not.toContain("Error: Cannot find module");
		expect(stderr).not.toContain("SyntaxError");
	});
});
