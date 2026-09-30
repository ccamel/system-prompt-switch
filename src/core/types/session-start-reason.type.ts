/**
 * Mirrors the `SessionStartEvent.reason` union documented by
 * @earendil-works/pi-coding-agent. The host exports no runtime enum, only the
 * type, so we keep our own list of every reason it can report.
 *
 * Observed caveat: a plain launch has been seen with `reason` undefined, so
 * callers must not assume the field is populated. Use SKIPPED_SESSION_REASONS
 * to decide "should the startup prompt be suppressed", never a positive match
 * on a single reason.
 */
export enum SessionStartReason {
	/** First session for this process; no previous session file. */
	Startup = "startup",
	/** Extensions reloaded without switching session. */
	Reload = "reload",
	/** The user asked for a new session (/new). Listed for completeness: the
	 *  host replaces the runtime on /new and never delivers session_start for
	 *  it, so there is nothing to act on here. A /new keeps the last prompt. */
	New = "new",
	/** An existing session file was opened. */
	Resume = "resume",
	/** Session branched from a previous one. */
	Fork = "fork",
}

/** Reasons that mean "keep the current prompt, do not ask again". */
export const SKIPPED_SESSION_REASONS: ReadonlySet<string> = new Set<string>([
	SessionStartReason.Resume,
	SessionStartReason.Reload,
	SessionStartReason.Fork,
]);
