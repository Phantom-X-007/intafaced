# Site audit v2 — plan + findings → fix (2026-08-09)

## Self-prompt (what to audit)

1. **Copy fidelity** — Denon full pack vs shipped text (missing rooms/sections = fail)
2. **Hero** — first viewport impact, poster energy, visual weight, CTAs
3. **Substance** — every major Roman section I–XXIV present or explicitly nested
4. **Visuals** — not text-only; terminal/rank/plane/ticker/bento craft
5. **Leverage** — internet patterns used with re-theme (not purple slop)
6. **TV bar** — still looks like real exchange/OS product, not payments site
7. **Perf/a11y** — motion reduced, mobile nav, contrast, no auth wall
8. **Honesty** — roadmap labels, demo data labeled

## Findings (v1 ship)

| ID  | Finding                                         | Severity | Fix                                         |
| --- | ----------------------------------------------- | -------- | ------------------------------------------- |
| A1  | Copy heavily compressed; IX–XXII mostly missing | P0       | Expand full section map from FULL bank      |
| A2  | Hero text-only; weak visual                     | P0       | Split hero + terminal visual + glow grid    |
| A3  | Almost no motion/leverage components            | P1       | Tickers, beam cards, plane toggle, counters |
| A4  | TRADE chart is flat SVG                         | P1       | Lightweight Charts CDN demo (Apache)        |
| A5  | No blueprint / rank / flywheel visuals          | P1       | Blueprint card + rank strip + stream grid   |
| A6  | Nav incomplete vs microcopy                     | P2       | Full nav labels                             |
| A7  | Em-dash / punctuation from source               | P3       | Keep Denon voice; minor cleanup only        |

## Target after fix

Live URL updated on GitHub Pages + monorepo branch; scoreboard V2 DONE.
