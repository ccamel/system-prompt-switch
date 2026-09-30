import { afterAll, beforeAll } from "bun:test";
import { cleanupTestPrompts, sweepStaleTestPrompts } from "./test-prompt-registry";

/**
 * Global safety net, loaded via bunfig preload.
 *
 * beforeAll:  remove prompt files left behind by a crashed or killed earlier run
 * afterAll:   remove anything a test in this run registered, pass or fail
 */
beforeAll(() => {
	const removed = sweepStaleTestPrompts();
	if (removed.length > 0) {
		console.log(`[test setup] removed ${removed.length} stale test prompt(s):`);
		for (const p of removed) console.log(`  - ${p}`);
	}
});

afterAll(() => {
	const removed = cleanupTestPrompts();
	if (removed.length > 0) {
		console.log(`[test teardown] removed ${removed.length} test prompt(s):`);
		for (const p of removed) console.log(`  - ${p}`);
	}
});
