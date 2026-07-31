# trade.mm-bot residual — research brief (2026-07-31)

## Law

§5.1 matching owns the book · §5.2 trade owns product · no invent balances · seed depth must use real orders/holds or documented house path.

## Why this mountain matters now

Futures mark-from-depth + liq ticks need a two-sided book. Journals only seed markets after real orders. Empty books → mid null → liquidation skip (correct) but product looks dead.

## On main now

- `matching.engine` **done** — book, depth, submit, journal/replay
- `trade.spot` money path places real orders that journal markets
- `trade.mm-bot` tracker row exists with **no status/note** (not started)
- No mm-bot service package

## Gaps

1. Seed process that posts two-sided quotes without lying about money
2. Who holds inventory (house ledger accounts) for seed size
3. Which markets get seeds (explicit list — never invent all)
4. Restart: reseed vs journal replay ownership
5. Risk: self-trade prevention per user — seed must use distinct house account ids

## DoD candidates (smallest ships)

| #   | Ship                                                     | Proof                 |
| --- | -------------------------------------------------------- | --------------------- |
| 1   | Research pack (this file)                                | Named residual set    |
| 2   | Design: house seeder account + recipe path               | Doctrine review       |
| 3   | Dev-only seeder CLI against matching submit + trade hold | Anvil/dev compose     |
| 4   | Optional trade.mm-bot service                            | Not invent prod depth |

## First PR

This research pack only. **Do not invent depth** without money path.

## Collision

Order-route #289 · futures jobs (consume depth, do not seed) · Denon multi-asset.
