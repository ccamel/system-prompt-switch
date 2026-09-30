import { describe, expect, it } from "bun:test";

describe("CLI Smoke Test", () => {
	it("loads extension cleanly via pi CLI without errors", async () => {
		const binary = "./node_modules/.bin/pi";
		const proc = Bun.spawn(
			[binary, "-e", "./extensions/index.ts", "--help"],
			{
				stdin: "ignore",
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
