# Critique — `b2-density`

**Skill used:** impeccable (product · layout density)  
**Surface:** `/exchange`  
**Date:** 2026-08-02

## Findings

| Sev | Finding                                             | Fix this PR? |
| --- | --------------------------------------------------- | ------------ |
| P0  | Marketing footer + 200px pad under desk → Dim6=1    | **Y**        |
| P0  | Fixed 726px columns ignore tall viewports           | **Y**        |
| P1  | Account blotter still short (200px) — OK for unauth | **partial**  |
| P2  | Glass/blur on panels residual (B1)                  | **N**        |

## Anti-slop

- [x] Empty still labeled
- [x] No confetti
- [x] Home still has marketing footer

## Proof

Orca: exchange a11y has **no** Copyright/footer block; home still has Copyright.  
Shot: `docs/styleboard/shots/b2-density-2026-08-02/02-exchange.png`
