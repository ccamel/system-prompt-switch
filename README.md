# system-prompt-switch

Pi / omp extension to manage custom system prompts **per session** with interactive selection modals, CRUD commands, and session isolation.

## Features

- **Per-Session Isolation:** Prompt selections are bound to each `sessionId` and recorded in the session's JSONL log. Switching or closing sessions never bleeds prompt state across sessions.
- **Explicit `(None / Default)` Option:** Clear the custom prompt anytime to revert to the base system prompt without deleting files.
- **New Session Modal:** Prompts you to pick a system prompt whenever a new session starts.
- **Built-in CRUD Commands:** Create, edit (using Pi's TUI editor), delete, and switch prompts without leaving your terminal.
- **Merge Modes:** Choose between `append` (safe default, keeps base prompt) and `replace` (custom prompt as base, preserves tools, skills, and project context).

## Commands

| Command | Description |
|---|---|
| `/sps-select` | Open modal to pick a prompt for the current session (or choose `(None / Default)`) |
| `/sps-new` | Create a new `.md` prompt file with Pi's interactive editor |
| `/sps-edit` | Edit an existing system prompt in Pi's editor |
| `/sps-delete` | Delete a prompt file from disk (resets session to default if active) |
| `/sps-mode [append\|replace]` | Toggle or set prompt injection mode for this session |
| `/sps-info` | Display active prompt, mode, prompt size, session ID, and directory |

## Installation

### In Pi
```bash
pi install npm:system-prompt-switch
```
Or load locally during development:
```bash
pi -e ./extensions/index.ts
```

### In omp
Add to your `omp` configuration or load as an extension:
```bash
omp --extension /path/to/system-prompt-switch/extensions/index.ts
```

## Directory & Environment Variables

- Default prompt directory: `~/.pi/agent/system-prompts/*.md`
- Override prompt directory: `export PI_SYSTEM_PROMPT_DIR="/custom/path"`
- Session state directory: `~/.pi/agent/state/system-prompt-switch/sessions.json`

## Testing

```bash
bun test
```
