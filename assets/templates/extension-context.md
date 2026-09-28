# System Prompt Switch (extension context)

This extension manages per-session system prompt overrides. When the user asks about their system prompt, custom prompts, or where a prompt file lives, look here first.

- **Active prompt(s):** {activePrompts}
- **Mode:** {mode}
- **Prompt file locations:**
  - Local (this repo): `.agents/system-prompts-switch/*.md`
  - Global (user home): `~/.omp/agent/system-prompts-switch/*.md` (omp) or `~/.pi/agent/system-prompts-switch/*.md` (pi)
- **Commands:** `/sps-select`, `/sps-inject`, `/sps-new`, `/sps-edit`, `/sps-delete`, `/sps-mode`, `/sps-info`, `/sps-path`, `/sps-logs`
- The user's active prompt is included below as a `### [scope] name` chunk. Read that chunk first when the user asks "what's my prompt" or "tail the append system prompt".