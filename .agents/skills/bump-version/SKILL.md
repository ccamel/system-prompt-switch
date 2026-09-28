# bump-version

Show the current package version and, on request, bump it via `bun pm version` (which edits `package.json`, creates a git commit `<new-version>`, and creates an annotated git tag `v<new-version>`).

## When to use

Run this skill when you need a quick status read on the project version or want to bump `package.json` (patch / minor / major) with a single canonical command.

## How to run

```bash
.agents/skills/bump-version/scripts/bump-version.sh           # status only
.agents/skills/bump-version/scripts/bump-version.sh --patch   # bun pm version patch
.agents/skills/bump-version/scripts/bump-version.sh --minor   # bun pm version minor
.agents/skills/bump-version/scripts/bump-version.sh --major   # bun pm version major
.agents/skills/bump-version/scripts/bump-version.sh --help
```

## Behavior

- **No flag** — prints status (name, current version, last git tag, current branch). No file changes.
- **`--patch | --minor | --major`** — calls `bun pm version <flag>`. Bun requires a clean working tree, then in one step: edits `package.json`, creates a git commit, and creates an annotated git tag `v<new-version>`. The skill does NOT create any additional commit or tag.
- **`--help`** — usage.

## Notes

- The working tree must be clean (no uncommitted changes). Commit or stash before running.
- If a tag `v<new-version>` already exists, `bun pm version` will fail — surface that error and resolve manually.
- The displayed version has no leading `v`; the tag is `v<semver>` (per repo convention).