#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"

FLAG="${1:-}"
if [ "${FLAG}" = "--help" ] || [ "${FLAG}" = "-h" ]; then
  cat << 'EOF'
Usage: bump-version.sh [--patch|--minor|--major|--help]

No flag      Show status (name, version, last tag, branch). No changes.
--patch      Run `bun pm version patch`, then create git tag v<new>.
--minor      Run `bun pm version minor`, then create git tag v<new>.
--major      Run `bun pm version major`, then create git tag v<new>.
--help       Show this help.

Tag is created at current HEAD. No commit is made.
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

# --- Status reader ---
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

# --- No flag: status only ---
if [ -z "${FLAG}" ]; then
  print_status
  exit 0
fi

# --- Apply bump ---
if ! command -v bun >/dev/null 2>&1; then
  echo "bun not found in PATH" >&2
  exit 1
fi

# `bun pm version <flag>` prints the new version on stdout (e.g. "0.1.1").
NEW_VERSION=$(bun pm version "${FLAG#--}")
NEW_VERSION="${NEW_VERSION//[$'\r\n ']/}"

if ! command -v git >/dev/null 2>&1; then
  echo "git not found in PATH — package.json bumped to ${NEW_VERSION} but tag was not created." >&2
  exit 1
fi

TAG="v${NEW_VERSION}"
if git rev-parse --verify "refs/tags/${TAG}" >/dev/null 2>&1; then
  echo "Tag ${TAG} already exists — aborting before tagging." >&2
  echo "package.json was bumped to ${NEW_VERSION}; resolve the conflict manually." >&2
  exit 1
fi

git tag -a "${TAG}" -m "Release ${TAG}"
echo "Tagged HEAD as ${TAG}"

# Refresh local vars for status block
VERSION="${NEW_VERSION}"
LAST_TAG="${TAG}"

print_status