# Critique — `b-cmdk`

**Skill used:** impeccable (product · keyboard power)  
**Surface:** global CommandPalette  
**Date:** 2026-08-02

## Findings

| Sev | Finding                             | Fix this PR?            |
| --- | ----------------------------------- | ----------------------- |
| P0  | No global jump before this slice    | **Y** — palette shipped |
| P1  | Markets only when store has symbols | **Y** by design honesty |
| P2  | No recent-history ranking           | **N** residual          |

## Anti-slop

- [x] Solid panel not glass blob
- [x] Honest empty filter copy
- [x] No competitor chrome

## Proof

Orca dialog “Command palette” with route list; shot `docs/styleboard/shots/b-cmdk-2026-08-02/01-palette.png`  
Golden: `node …/cmd-palette.golden.js` OK
