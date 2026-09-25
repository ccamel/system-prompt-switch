import type { SessionPromptConfig } from "../core/types";

export interface SessionStatePort {
	getSessionConfig(sessionId: string): Promise<SessionPromptConfig | null>;
	setSessionConfig(sessionId: string, config: SessionPromptConfig): Promise<void>;
}
