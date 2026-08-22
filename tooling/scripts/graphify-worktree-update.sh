#!/bin/sh
# Refresh this worktree's graphify-out/ (AST only). Never git add.
# Official graphify post-commit skips linked worktrees; this is the cook-local fill.
# Usage: graphify-worktree-update.sh [--wait]
set -u
export PATH="${HOME}/.local/bin:/opt/homebrew/bin:${PATH:-/usr/bin:/bin}"
export GRAPHIFY_MAX_WORKERS="${GRAPHIFY_MAX_WORKERS:-1}"
export PYTHONHASHSEED=0

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$ROOT" || exit 0
[ -f graphify-out/graph.json ] || exit 0
command -v graphify >/dev/null 2>&1 || exit 0

LOG="$ROOT/graphify-out/cache/wt-refresh.log"
mkdir -p "$ROOT/graphify-out/cache"

run_update() {
  echo "[$(date -u +%Y-%m-%dT%H:%MZ)] graphify update . (wait=${1:-no})" >>"$LOG"
  graphify update . >>"$LOG" 2>&1 || echo "[$(date -u +%Y-%m-%dT%H:%MZ)] update failed (fail-open)" >>"$LOG"
}

if [ "${1:-}" = "--wait" ]; then
  run_update wait
  exit 0
fi

# Detached: do not block git commit / pnpm wt. macOS has no setsid.
( run_update detached ) >/dev/null 2>&1 &
exit 0
