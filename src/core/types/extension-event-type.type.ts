/** The `type` field shared by every extension lifecycle event. */
export enum ExtensionEventType {
	SessionStart = "session_start",
	SessionShutdown = "session_shutdown",
	BeforeAgentStart = "before_agent_start",
}
