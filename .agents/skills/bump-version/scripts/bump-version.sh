#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"

FLAG="${1:-}"
if [ "${FLAG}" = "--help" ] || [ "${FLAG}" = "-h" ]; then
  cat << 'EOF'
Usage: bump-version.sh [--patch|--minor|--major|--help]

No flag      Show status (name, version, last tag, branch). No changes.
--patch      Run `bun pm version patch` (bumps package.json, commits, tags).
--minor      Run `bun pm version minor`.
--major      Run `bun pm version major`.
--help       Show this help.

`bun pm version` requires a clean working tree, edits package.json, creates a
git commit "<new-version>", and creates an annotated git tag v<new-version>.
The script only wraps it; it does not create any extra commit or tag.
EOF
  exit 0
fi

case "${FLAG}" in
  --patch|--minor|--major) ;;
  "") ;;
  *)
    echo "Unknown flag: ${FLAG}" >&2
    exit 2
    ;;
esac

cd "${ROOT_DIR}"

NAME=$(grep -o '"name": *"[^"]*"' package.json | cut -d'"' -f4)
VERSION=$(grep -o '"version": *"[^"]*"' package.json | cut -d'"' -f4)

LAST_TAG="(no tags)"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if LT=$(git describe --tags --abbrev=0 2>/dev/null); then
    LAST_TAG="${LT}"
  fi
fi

BRANCH="(no git)"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(detached)")
fi

print_status() {
  echo "============================================================"
  echo " VERSION STATUS"
  echo "============================================================"
  echo "Project Root : ${ROOT_DIR}"
  echo "• Name       : ${NAME}"
  echo "• Version    : ${VERSION}"
  echo "• Last Tag    : ${LAST_TAG}"
  echo "• Branch      : ${BRANCH}"
  echo "============================================================"
}

if [ -z "${FLAG}" ]; then
  print_status
  exit 0
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "bun not found in PATH" >&2
  exit 1
fi

# `bun pm version <flag>` requires a clean tree. It edits package.json,
# creates a git commit, and creates an annotated git tag v<new>.
bun pm version "${FLAG#--}"

# Refresh local vars from disk for status block
VERSION=$(grep -o '"version": *"[^"]*"' package.json | cut -d'"' -f4)
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "(no tags)")
fi

print_status