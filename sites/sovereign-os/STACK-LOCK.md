# STACK-LOCK — Sovereign OS apply site

**Locked 2026-08-09 · AFK run**

| Layer       | Choice                                                                                       | Licence / note                                                  |
| ----------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Delivery    | Static HTML + CSS + JS                                                                       | No framework build (env has no pnpm; max reliability overnight) |
| Host target | GitHub raw Pages / Cloudflare tunnel / custom `trade.intafaced.com`                          | First public HTTPS wins                                         |
| Tokens      | CSS variables: void black, lime accent, mono + display system fonts with selective grotesque | No Inter-default purple                                         |
| Motion      | CSS only (marquee, fade)                                                                     | prefers-reduced-motion respected                                |
| Icons       | Inline SVG minimal / unicode                                                                 | No icon npm pack                                                |
| Charts      | CSS terminal mock only                                                                       | No Advanced Charts; no unlicensed TV files                      |
| Content     | Denon bank MD / inlined sections                                                             | Words SoT                                                       |

## Section → source

| Section                 | Source                                                 |
| ----------------------- | ------------------------------------------------------ |
| Nav, footer             | CUSTOM                                                 |
| Hero + stats + ticker   | CUSTOM + CSS marquee (Magic UI pattern, reimplemented) |
| Manifesto, laws         | CUSTOM editorial                                       |
| Planes                  | CUSTOM split                                           |
| Rooms bento             | CUSTOM grid                                            |
| Systems tabs            | CUSTOM JS tabs                                         |
| TRADE                   | CUSTOM + terminal mock                                 |
| Drop / never-do / close | CUSTOM                                                 |
| Accordion walls         | CUSTOM details/summary                                 |

## Kill list

Aceternity purple demos, three equal SaaS cards as identity, payments cal.com primary, Advanced Charts package, three.js.

## V2 additions (audit fix)

- Lightweight Charts 4.2.0 via unpkg CDN (Apache-2.0) for TRADE demo only
- Beam border cards (Magic UI-style pattern, re-themed lime)
- CSS marquee tickers (max 2: open + close)
- Plane toggle, systems tabs, blueprint card, stream pills
- Noise + grid ambient layers
- Full Denon section map I–XXIV via content.json generator
