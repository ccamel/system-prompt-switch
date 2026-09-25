# system-prompt-switch

Pi and OMP extension to manage custom system prompts **per session** with interactive selection modals, CRUD commands, session isolation, and multi-scope storage (global + local repo).

## Features

- **Multi-Scope Prompts:**
  - **Local (`[local]`):** `<cwd>/.agents/system-prompts-switch/*.md` (committable to git for project-specific prompts).
  - **Global (`[global]`):** `~/.omp/agent/system-prompts-switch/*.md` (for OMP) or `~/.pi/agent/system-prompts-switch/*.md` (for Pi).
- **Per-Session Isolation:** Prompt selections are bound to each `sessionId` and recorded in the session's JSONL log. Switching or closing sessions never bleeds prompt state across sessions.
- **Explicit `(None / Default)` Option:** Clear the custom prompt anytime to revert to the base system prompt without deleting files.
- **New Session Modal:** Prompts you to pick a system prompt (with `[local]` and `[global]` chips) whenever a new session starts.
- **Built-in CRUD Commands:** Create (choosing local or global scope), edit (using the built-in terminal editor), delete, and switch prompts without leaving your terminal.
- **Automatic Legacy Migration:** On first run, if `system-prompts-switch/` is empty, existing prompts from `~/.pi/agent/system-prompts/` are copied over automatically.
- **Merge Modes:** Choose between `append` (safe default, keeps base prompt) and `replace` (custom prompt as base, preserves tools, skills, and project context).

## Commands

| Command | Description |
|---|---|
| `/sps-select` | Open modal to pick a prompt for the current session (or choose `(None / Default)`) |
| `/sps-inject` | Cumulatively stack/inject multiple system prompts simultaneously for this session |
| `/sps-new` | Create a new `.md` prompt file (asks for local vs global scope, opens chosen editor) |
| `/sps-edit` | Edit an existing system prompt (choose between built-in TUI, VS Code, or $EDITOR) |
| `/sps-delete` | Delete a prompt file from disk (resets session to default if active) |
| `/sps-mode [append\|replace]` | Toggle or set prompt injection mode for this session |
| `/sps-info` | Display active host (`OMP` or `PI`), active prompts, mode, session ID, and directories |

## Directory Layout & Environment Variables

| Scope / Host | Default Location | Override Environment Variable |
|---|---|---|
| **Local Repo** | `<cwd>/.agents/system-prompts-switch/` | `SPS_LOCAL_PROMPT_DIR` |
| **OMP Global** | `~/.omp/agent/system-prompts-switch/` | `SPS_PROMPT_DIR` or `SYSTEM_PROMPT_DIR` |
| **Pi Global** | `~/.pi/agent/system-prompts-switch/` | `SPS_PROMPT_DIR` or `SYSTEM_PROMPT_DIR` |
| **State File** | `~/.<host>/agent/state/system-prompt-switch/sessions.json` | `SPS_STATE_PATH` |

## Installation

### In OMP
Load directly during a session:
```bash
omp -e ./extensions/index.ts
```
Or link permanently:
```bash
omp plugin link .
```

### In Pi
```bash
pi -e ./extensions/index.ts
```
Or install from npm:
```bash
pi install npm:system-prompt-switch
```

## Testing

```bash
bun test
```
