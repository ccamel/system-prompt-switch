# system-prompt-switch

Pi and OMP extension to manage custom system prompts **per session** with interactive selection modals, cumulative prompt injection, CRUD commands, session isolation, and multi-scope storage (`[local]` repo + `[global]` user home).

---

## Key Features

- **Multi-Scope Prompts:**
  - **Local (`[local]`):** `<cwd>/.agents/system-prompts-switch/*.md` — Scoped to the current repository, committable to Git.
  - **Global (`[global]`):** `~/.omp/agent/system-prompts-switch/*.md` (OMP) or `~/.pi/agent/system-prompts-switch/*.md` (Pi) — Available in all directories.
- **Per-Session Isolation:** Prompt selections are bound to each session ID and logged to the session's JSONL file. Multiple concurrent or sequential sessions never leak prompt state into each other.
- **Prominent Above-Editor Banner:** Active prompts render directly above the input prompt (`> |`):
  ```
  ╭─ 🎯 Active Prompt: [global] <system-prompt-name>.md (append mode) ─╮
  ```
  The banner disappears automatically when no custom prompt is active.
- **Startup & New Session Modal:** On terminal launch or `/new`, an interactive modal appears offering:
  - `(None / Default)`
  - `+ Create new prompt...`
  - All available `[local]` and `[global]` prompts
- **Cumulative Prompt Stacking (`/sps-inject`):** Stack multiple prompts simultaneously into one session (e.g. `[global] <system-prompt-name>.md + [local] project-rules.md`).
- **External Editor Support:** When creating or editing prompts, choose between:
  1. Built-in terminal editor (with explicit hint: `Enter` to save, `Shift+Enter` for newline)
  2. Visual Studio Code (`code --wait`)
  3. System terminal editor (`$EDITOR` / `nano` / `vim`)
- **Automatic Legacy Migration:** On first run, if `system-prompts-switch/` is empty, existing prompts from `~/.pi/agent/system-prompts/` are copied over automatically.
- **Merge Modes:** Choose between `append` (safe default, keeps base instructions) and `replace` (custom prompt as base, preserves tools, skills, and project context).

---

## Commands

| Command | Description |
|---|---|
| `/sps-select` | Open modal to pick a prompt for the current session (or choose `(None / Default)`) |
| `/sps-inject` | Cumulatively stack or toggle multiple system prompts simultaneously |
| `/sps-new` | Create a new `.md` prompt file directly in OMP (choose local vs global) |
| `/sps-edit` | Edit an existing prompt in OMP's built-in editor |
| `/sps-path` | Display copy-ready absolute paths for active prompt and all local/global files |
| `/sps-delete` | Delete a prompt file from disk (resets session if it was active) |
| `/sps-mode [append\|replace]` | Toggle or set prompt injection mode for this session |
| `/sps-info` | Display active host (`OMP` or `PI`), active prompts, mode, session ID, and directories |
| `/sps-logs [lines]` | Display recent session logs and print live tail command |
---

## Directory Layout & Environment Variables

| Scope / Host | Default Location | Override Environment Variable |
|---|---|---|
| **Local Repo** | `<cwd>/.agents/system-prompts-switch/` | `SPS_LOCAL_PROMPT_DIR` |
| **OMP Global** | `~/.omp/agent/system-prompts-switch/` | `SPS_PROMPT_DIR` or `SYSTEM_PROMPT_DIR` |
| **Pi Global** | `~/.pi/agent/system-prompts-switch/` | `SPS_PROMPT_DIR` or `SYSTEM_PROMPT_DIR` |
| **State File** | `~/.<host>/agent/state/system-prompt-switch/sessions.json` | `SPS_STATE_PATH` |


## Live Debugging & Logs

All session events, modal choices, editor launches, and injection steps are logged to disk:

- **OMP log:** `~/.omp/agent/logs/system-prompt-switch.log`
- **Pi log:** `~/.pi/agent/logs/system-prompt-switch.log`

### 1. Real-time log tailing in a second terminal:
```bash
# For OMP
tail -f ~/.omp/agent/logs/system-prompt-switch.log

# For Pi
tail -f ~/.pi/agent/logs/system-prompt-switch.log
```

### 2. View logs inside your running session:
```
/sps-logs
/sps-logs 50
```

---

## Keyboard Shortcuts & Editor Behavior

- **Submit & Save:** `Ctrl+Q` (Windows/WSL Terminal) or `\ + Enter` (standard terminal)
- **Insert Newline:** `Enter` or `Shift+Enter`
- **Cancel / Close Dialog:** `Esc`
- **Manual Editing:** Run `/sps-path` to print absolute file paths, then edit files directly by hand in your preferred editor (VS Code, Cursor, etc.).

---

## Prompt Name Collision Rules

- **Local vs. Global Coexistence:** You can have `[local] guidelines.md` and `[global] guidelines.md` simultaneously. Both will appear in `/sps-select` and `/sps-inject` clearly tagged by scope.
- **Same-Scope Collision:** Creating a prompt that already exists in the *same* scope (e.g. creating in `local` when `local/guidelines.md` exists) is rejected with an error notification.
---

## Testing & Usage

### 1. Test in OMP with clean isolation (recommended)
Launch OMP without other plugins and in a clean profile:
```bash
omp --no-extensions --profile test -e ./extensions/index.ts
```

### 2. Test in OMP with your current profile
```bash
omp --no-extensions -e ./extensions/index.ts
```

### 3. Link permanently in OMP
To have `system-prompt-switch` load automatically on every session:
```bash
omp plugin link .
```

### 4. Run automated test suite
Runs all 36 unit and E2E tests:
```bash
bun test
```

### 5. Run whole-project linter
Fast linting via Oxlint:
```bash
bun run lint
```
