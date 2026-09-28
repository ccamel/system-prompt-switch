# bump-version

Show the current package version and, on request, bump it using `bun pm version` and create a matching `v<version>` git tag.

## When to use

Run this skill when you need a quick status read on the project version or want to bump `package.json` (patch / minor / major) and tag the current HEAD.

## How to run

```bash
.agents/skills/bump-version/scripts/bump-version.sh           # status only
.agents/skills/bump-version/scripts/bump-version.sh --patch   # bump + tag
.agents/skills/bump-version/scripts/bump-version.sh --minor   # bump + tag
.agents/skills/bump-version/scripts/bump-version.sh --major   # bump + tag
.agents/skills/bump-version/scripts/bump-version.sh --help
```

## Behavior

- **No flag** — prints status (name, current version, last git tag, current branch). No file changes.
- **`--patch | --minor | --major`** — runs `bun pm version <flag>`, then creates an annotated git tag `v<new-version>` at the current HEAD. Does NOT create a commit (commit/package.json edit must already be staged by the caller, or `bun pm version` will fail on a dirty tree — surfaced as-is).
- **`--help`** — usage.

## Notes

- Tagging is opt-in per the user's choice: no commit is created. If you want commit + tag bundled, do the commit yourself first or extend the script.
- If a tag `v<new-version>` already exists, the script aborts before tagging (no overwrite).