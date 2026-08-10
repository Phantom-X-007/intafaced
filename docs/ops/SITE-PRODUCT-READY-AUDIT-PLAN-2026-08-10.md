# Sovereign OS site — product-ready mega audit + finish (2026-08-10)

**Status:** DONE  
**Live:** https://zenyoda3.github.io/intafaced-sovereign-os/  
**Code:** `sites/sovereign-os` · branch `feat/tv-sovereign-os-apply-site`  
**Pages tip:** redeployed after product-ready pass (real logo + anti-flash + splits)

## P0 bugs

| ID  | Bug                 | Status                                                                                                 |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| B1  | Black flash on load | **FIXED** — content always opaque under overlay; static `#boot` first paint; only overlay fades        |
| B2  | Double finish race  | **FIXED** — single `finished` gate                                                                     |
| B3  | Logo missing        | **FIXED** — official brand mark from `Documents/intafaced branding` in nav / loader / footer / favicon |

## Fan-out audit (3 parallel explore agents)

### Load / motion

- [x] No black frame between loader and content
- [x] Loader fades cleanly
- [x] 3D preloads during boot; fade-in after warm frames
- [x] Reduced-motion: no 3D (sync init), short loader
- [x] Tab hidden: 3D pauses (`document.hidden` + visibilitychange)
- [x] StrictMode dispose safety on hero engine

### Layout / brand

- [x] Full-bleed alive edges
- [x] Logo in nav, loader, footer, favicon, first paint
- [x] Brand lime `#c4f000` (kit official)
- [x] CTAs clickable
- [x] Focus-visible rings + mobile menu `aria-expanded`
- [x] Duplicate `id="top"` removed from hero

### Perf

- [x] Three code-split (~533 kB async)
- [x] Trade chart / LWC lazy (~165 kB async)
- [x] Phosphor CSR deep imports (5020 → 487 modules)
- [x] Main ~416 kB (was ~581 kB)
- [x] BlurFade no CSS filter blur (cheaper)
- [x] DPR capped; quality tiers low/med/high

### Content / legal

- [x] MIT credit wave-grid (NOTICE + footer)
- [x] Demo/illustrative prices + DEMO TAPE
- [x] No Advanced Charts binary (LWC only)
- [x] Vendor names stripped from UI meta

### Ship

- [x] `npm run build` green
- [x] `oxlint` 0 errors
- [x] Pages redeployed
- [ ] Hard-refresh verified by Nitro on his device

## Bundle (post-optimize)

| Chunk          | ~gzip  |
| -------------- | ------ |
| index (main)   | 131 kB |
| trade-chart    | 54 kB  |
| waveGridEngine | 134 kB |
| CSS            | 7.5 kB |

## Finished means (peace of mind)

1. **Load:** hard refresh → brand boot → site appears; **no full black dip** mid-transition.
2. **Brand:** three-block mark + INTA**FACED** wordmark in header, boot, footer; lime favicon.
3. **Motion:** reduced-motion users get no WebGL hero.
4. **Honesty:** chart + tape marked demo; MIT credit visible.
5. **Live URL serves current assets** (hash changes after each deploy).
6. **Residual (not blockers):** GPU can warm under boot overlay; composer DPR not separate; Google Drive brand kit link still optional if more assets needed.

## Residual human holds

- Optional: paste Google brand-kit link if newer assets supersede `Documents/intafaced branding`
- Optional: custom domain `trade.intafaced.com` DNS
- TV form submit (human) when ready
