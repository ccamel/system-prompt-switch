import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Logger, resolveLogPath } from "../../src/core/logger";

describe("Logger", () => {
	let tempDir: string;
	let logPath: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sps-logger-test-"));
		logPath = path.join(tempDir, "logs", "test.log");
	});

	afterEach(() => {
		try {
			fs.rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup
		}
	});

	it("resolves default log path for omp and pi", () => {
		const ompPath = resolveLogPath("omp");
		expect(ompPath).toContain(".omp");
		expect(ompPath).toContain("system-prompt-switch.log");

		const piPath = resolveLogPath("pi");
		expect(piPath).toContain(".pi");
		expect(piPath).toContain("system-prompt-switch.log");
	});

	it("respects custom log path and SPS_LOG_PATH env var", () => {
		const custom = resolveLogPath("omp", "/custom/path/sps.log");
		expect(custom).toBe("/custom/path/sps.log");

		process.env.SPS_LOG_PATH = "/env/override.log";
		expect(resolveLogPath("omp")).toBe("/env/override.log");
		delete process.env.SPS_LOG_PATH;
	});

	it("writes structured logs and retrieves recent entries", () => {
		const logger = new Logger(logPath);

		logger.info("TEST_TAG", "Information message", { count: 42 });
		logger.warn("TEST_TAG", "Warning message");
		logger.error("TEST_TAG", "Error message", { err: "failed" });

		expect(fs.existsSync(logPath)).toBe(true);
		const content = fs.readFileSync(logPath, "utf-8");

		expect(content).toContain("[INFO] [TEST_TAG] Information message {\"count\":42}");
		expect(content).toContain("[WARN] [TEST_TAG] Warning message");
		expect(content).toContain("[ERROR] [TEST_TAG] Error message {\"err\":\"failed\"}");

		const recent = logger.getRecent(2);
		expect(recent.length).toBe(2);
		expect(recent[0]).toContain("[WARN]");
		expect(recent[1]).toContain("[ERROR]");
	});

	it("handles non-existent log file gracefully in getRecent", () => {
		const logger = new Logger(path.join(tempDir, "does-not-exist.log"));
		const recent = logger.getRecent(10);
		expect(recent.length).toBe(1);
		expect(recent[0]).toContain("No log file found");
	});
});
