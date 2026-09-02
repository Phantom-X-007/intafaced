#!/bin/bash
# Pass 3 authenticated browser proof.
# Usage from repo root: bash tooling/uiproof/run-pass3.sh
# Or: pnpm ui:proof:pass3
set -euo pipefail
WORKTREE="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$WORKTREE"
export PATH="${WORKTREE}/.tools/pnpm:/Users/Nitro/projects/Sovereign/.tools/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"
if [ -z "${STREAM_A_NODE:-}" ] && [ -x "$WORKTREE/.tools/node24/bin/node" ]; then
  export STREAM_A_NODE="$WORKTREE/.tools/node24/bin/node"
fi
if [ -z "${PLAYWRIGHT_BROWSERS_PATH:-}" ] && [ -d "$WORKTREE/.tools/ms-playwright" ]; then
  export PLAYWRIGHT_BROWSERS_PATH="$WORKTREE/.tools/ms-playwright"
fi
export PORT="${PORT:-8090}"
mkdir -p .artifacts/uiproof
echo "=== Pass 3 auth proof $(date -u +%Y-%m-%dT%H:%M:%SZ) ===" | tee .artifacts/uiproof/pass3-run.log
pnpm ui:boot 2>&1 | tee -a .artifacts/uiproof/pass3-run.log
set +e
pnpm ui:proof:auth 2>&1 | tee -a .artifacts/uiproof/pass3-run.log
EC=${PIPESTATUS[0]}
set -e
echo "EXIT_CODE=$EC" | tee -a .artifacts/uiproof/pass3-run.log
echo "SHOTS:" | tee -a .artifacts/uiproof/pass3-run.log
ls -la .artifacts/uiproof/shots-auth/ 2>&1 | tee -a .artifacts/uiproof/pass3-run.log || true
if [ "$EC" -eq 0 ]; then
  echo PASS3_GREEN > .artifacts/uiproof/pass3-status.txt
else
  echo PASS3_FAIL > .artifacts/uiproof/pass3-status.txt
fi
echo "Done. Status: $(cat .artifacts/uiproof/pass3-status.txt)"
exit "$EC"
