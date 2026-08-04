# AFK — no stamp mill

**Binding.** Cold agents read this with [`SWARM-MANDATE.md`](./SWARM-MANDATE.md).

## Failure mode we already hit

`freeProduct=0` → agents opened R07/R01/P-WS “cycle N” docs PRs every few minutes. Board unchanged. Invent still 0. Partner ready list unchanged. **That is drift, not progress.**

## Rule

| Allowed when freeProduct=0                                 | Forbidden                                         |
| ---------------------------------------------------------- | ------------------------------------------------- |
| P1 land stranded branches (path-clean)                     | R07 peace cycle PRs with same freeProduct=0 board |
| P2 exact partner CI fail comments                          | Merging Denon/Shehzad PRs                         |
| P3 code-grounded TRK research deepen                       | Dual-edit partner open PR paths                   |
| P4 invent/P-WS **only if** code or #433/#432 state changed | Invent/P-WS stamp with no delta                   |
| P5 claims/LIVE-LANES truth + merge green Nitro Class N     | freeProduct=0 as session kill                     |

## Machine enforcement

- `pnpm swarm:status` / `swarm:next` / FREEZE-LIVE print **afk-ladder** + **stamp-mill BAN** when freeProduct=0
- Schedulers must re-run ladder, not open cycle stamps

## Re-derive

```bash
pnpm swarm:freeze && pnpm swarm:status && pnpm swarm:next
```
