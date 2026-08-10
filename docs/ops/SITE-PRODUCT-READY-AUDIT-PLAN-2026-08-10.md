# Sovereign OS site — product-ready mega audit + finish plan (2026-08-10)

**Status:** EXECUTING  
**Live:** https://zenyoda3.github.io/intafaced-sovereign-os/  
**Code:** `sites/sovereign-os` (worktree `feat/tv-sovereign-os-apply-site`)

## P0 bugs
| ID | Bug | Fix |
| --- | --- | --- |
| B1 | Black flash on load | Content always visible under overlay; only overlay fades (SiteLoader rewrite) |
| B2 | Double finish race in loader | Single `finished` gate |
| B3 | Logo missing | BrandMark component; SVG when brand kit arrives |

## Fan-out audit checklist (product-ready)

### Load / motion
- [ ] No black frame between loader and content
- [ ] Loader fades cleanly
- [ ] 3D preloads during boot; fade-in after warm frames
- [ ] Reduced-motion: no 3D, short loader
- [ ] Tab hidden: 3D pauses

### Layout / brand
- [ ] Full-bleed alive edges
- [ ] Logo in nav, loader, footer
- [ ] CTAs always clickable
- [ ] Contrast over 3D

### Perf
- [ ] Three code-split
- [ ] DPR capped
- [ ] No duplicate engines (StrictMode safe dispose)

### Content / legal
- [ ] MIT credit for wave-grid
- [ ] No fake prices as real
- [ ] No Advanced Charts binary

### Ship
- [ ] `npm run build` green
- [ ] Pages redeployed
- [ ] Hard-refresh verified

## Finished means
All P0 fixed + build green + live URL serves new assets + scoreboard DONE.
