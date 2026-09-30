import * as fs from "node:fs";
import { TestPrompt } from "../fixtures/test-prompt.enum";

/**
 * Central registry of every prompt file a test creates.
 *
 * A test calls `registerTestPrompt()` for each file it writes;
 * `tests/helpers/global-setup.ts` (loaded via bunfig preload) then removes the
 * whole registry on exit — pass or fail — so a run can never leave junk in
 * ~/.omp/agent/system-prompts-switch/ or ~/.pi/agent/system-prompts-switch/.
 */
const registry = new Map<string, Set<string>>();

/** Record a prompt file a test created, so it gets cleaned up afterwards. */
export function registerTestPrompt(
	promptDir: string,
	name: TestPrompt | string,
): void {
	const names = registry.get(promptDir) ?? new Set<string>();
	names.add(name);
	registry.set(promptDir, names);
}

/** Remove every registered prompt file. Safe to call when nothing is registered. */
export function cleanupTestPrompts(): string[] {
	const removed: string[] = [];
	for (const [dir, names] of registry) {
		for (const name of names) {
			remove(`${dir}/${name}`, removed);
		}
	}
	registry.clear();
	return removed;
}

/**
 * Safety net for the whole suite: delete anything in the real prompt
 * directories whose name is a known test prompt but which no live test
 * registered. Runs before the suite, so a previously crashed or killed run
 * cannot leave files behind.
 */
export function sweepStaleTestPrompts(home = process.env.HOME ?? ""): string[] {
	if (!home) return [];
	const known = new Set<string>(Object.values(TestPrompt));
	const removed: string[] = [];
	for (const dir of [
		`${home}/.omp/agent/system-prompts-switch`,
		`${home}/.pi/agent/system-prompts-switch`,
	]) {
		if (registry.has(dir)) continue;
		let entries: string[];
		try {
			if (!fs.existsSync(dir)) continue;
			entries = fs.readdirSync(dir);
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (known.has(entry)) remove(`${dir}/${entry}`, removed);
		}
	}
	return removed;
}

/** Best effort: a test must never fail because cleanup could not run. */
function remove(path: string, removed: string[]): void {
	try {
		if (!fs.existsSync(path)) return;
		fs.rmSync(path, { force: true });
		removed.push(path);
	} catch {
		// ignore
	}
}
