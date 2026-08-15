---
name: graphify
description: >
  Use for any question about this codebase, its architecture, file relationships,
  or where a symbol lives — especially when graphify-out/graph.json exists.
  Query the graph instead of grepping or reading the universe.
---

# Graphify (INTAFACED)

Official CLI: `graphify` (package `graphifyy`). This file is the **project** skill.
Repo law (`AGENTS.md`) wins if this file and doctrine disagree.

## When graphify-out/graph.json exists

Do this **before** Grep / broad Read / loading START-HERE / paste walls:

```
graphify query "<question>" --budget 1500
graphify path "<A>" "<B>"
graphify explain "<concept>"
```

Then open the **one** source file you will edit.

Read `graphify-out/GRAPH_REPORT.md` only for broad architecture. Do not dump it into chat.

## When the graph is missing

`graphify-out/` is gitignored local cache. Once per worktree:

```
pnpm graphify:extract
```

That is AST-only (no API key). `.graphifyignore` allowlists `services/` + `packages/` and excludes markdown / paste walls / vendor.

Do **not** run extract on `docs/paste-w*` or old boards.

## After you change code

```
graphify update .
```

AST-only, no API cost. The official git hook skips linked worktrees; this repo works in worktrees, so you run the update.

## Do not

- Treat the graph as law. Doctrine, tracker, and live `gh` win on ownership, money, and tip state.
- Re-read `AGENTS.md` / START-HERE / a paste OS to find a symbol the graph can name.
- Install a second memory hub or rebuild the product SPA to “understand the repo.”
