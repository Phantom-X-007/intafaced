#!/usr/bin/env python3
"""Run official graphify hook-guard for Claude only.

Grok already has query-first. hook-guard additionalContext is a per-grep tax.
Detect Grok by camelCase payload (toolName / toolInput). GROK_AGENT is often
unset in the hook subprocess.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

MODE = sys.argv[1] if len(sys.argv) > 1 else "search"


def main() -> int:
    raw = sys.stdin.buffer.read()
    try:
        d = json.loads(raw.decode("utf-8", "replace") or "{}")
    except Exception:
        return 0
    if not isinstance(d, dict):
        return 0
    if "toolName" in d or "toolInput" in d:
        return 0
    if os.environ.get("GROK_AGENT") or os.environ.get("TERM_PROGRAM") == "Orca":
        return 0
    bin_path = os.path.expanduser("~/.local/bin/graphify")
    if not os.path.isfile(bin_path):
        return 0
    p = subprocess.run([bin_path, "hook-guard", MODE], input=raw)
    return int(p.returncode or 0)


if __name__ == "__main__":
    raise SystemExit(main())
