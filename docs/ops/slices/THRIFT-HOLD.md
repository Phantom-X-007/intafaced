**Status: VOID — thrift deleted 2026-08-07. Not a hold.**

# L3 free-TRK factory — hold LIFTED (2026-08-07)

**Updated:** 2026-08-07  
**Tip base:** #925 / 1bd51cf4  
**Open partner:** #904 only (babysit — never dual-edit / never agent-merge)  
**Open other:** #926 doctrine-red — do not dual-edit

## There is no hold

The throttle this file used to carry — run-count caps, "ship one fat PR only", `THRIFT_ALLOW`,
waiting for a 24h window to cool — was **deleted on 2026-08-07**. The repo is public, so GitHub
Actions on standard runners are free and unlimited, and the bill it protected does not exist.
Retirement note: [`../../GITHUB-CI-SPEND-CONTROL-2026-07-31.md`](../../GITHUB-CI-SPEND-CONTROL-2026-07-31.md).

**Never hold a finished slice back.** Open the PR when the unit is done. One concern per PR —
reviewability, not batching.

## Rules that survive (never about cost)

- **Partner open PRs are a hard wall.** #904 is Denon's — babysit, never dual-edit, never agent-merge.
- **No `workflow_dispatch`** on a branch that already has PR checks — it runs the same thing twice for no new signal.
- **`pnpm verify` green locally before the push** that opens or updates a code PR. Local is seconds; CI is minutes.

## Wave 209–211

On `feat/l3-free-trk-wave209`:

- wave209 app-env-honesty (packages/config)
- wave210 plane-honesty (packages/config)
- wave211 launch-drop-honesty (packages/config)

Class N pure catalogs + packs. No partner path intersect.
