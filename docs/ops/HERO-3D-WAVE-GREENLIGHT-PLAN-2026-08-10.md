# Hero 3D Wave Grid — Greenlight Plan + Enhanced Builder Prompt (2026-08-10)

**Status:** AWAITING NITRO GREENLIGHT · no code until `go hero 3d`  
**Live site:** https://zenyoda3.github.io/intafaced-sovereign-os/  
**Code home (truth):** worktree `tv-sovereign-os-site` · package `sites/sovereign-os` (Vite + React + TW + multi-lib V4)  
**Primary leverage:** https://github.com/franky-adl/3d-wave-grid (MIT · Three.js + GLSL · demo linked from repo)  
**Inspiration only:** https://singularity.misterprada.com/ · optional https://projects.arkon.digital/threejs/distorted-torus/

---

## 0 · What “not compromising the heroes” means

| Promise                                             | How we enforce                                                                                                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **3d-wave-grid is used for real**                   | Port wave-grid concept into a `HeroWaveCanvas` module; STACK-LOCK names file + MIT; not a random unrelated Three demo                                                 |
| **Cinematic quality (Singularity-class restraint)** | Depth, slow motion, premium hierarchy — **not** a busy tech demo; copy/CTAs always win z-index and contrast                                                           |
| **No lag**                                          | Perf budget below; DPR cap; pause offscreen; mobile fallback **required** not optional                                                                                |
| **No brand/message damage**                         | Denon hero copy + CUT MY KEY / ENTER CTAs stay; lime/void tokens; no partner names, no fake prices                                                                    |
| **No second website**                               | Only edit `sites/sovereign-os` hero layer; rest of V4 spine stays                                                                                                     |
| **Licence clean**                                   | MIT notice for franky-adl/3d-wave-grid in NOTICE or site credits; strip lil-gui from prod                                                                             |
| **Ship path honest**                                | Build + deploy Pages; monorepo `pnpm verify` only if path requires — **isolated site** may not need full monorepo matrix for pure marketing package (state which ran) |

**Compromise =** embedding a full second Vite app, leaving stats GUI on, ignoring mobile, covering the headline, or skipping fallbacks.

---

## 1 · Corrections to the other agent’s prompt (do not follow blindly)

| Their assumption                             | Reality                                                                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| “Shared UI design system / monorepo service” | Marketing site is **isolated** `sites/sovereign-os` (React Vite), not vendor shell product UI                                          |
| “pnpm verify full monorepo always”           | **Site package:** `npm run build` in `sites/sovereign-os`. Full `pnpm verify` only if touching monorepo packages — avoid false thrash  |
| “tracker / LIVE-LANES claim”                 | Docs/marketing site PR is fine; not a features.mjs mountain unless they force it — **claim only if opening monorepo PR that needs it** |
| “ASCII research path”                        | User **now chose 3D wave-grid heroes** — supersede ASCII catalogue for this ship                                                       |
| “Add three.js casually”                      | Three is **heavy** — must lazy-load + mobile 2D fallback or site will lag                                                              |
| “Implement then ship all process”            | Greenlight first (this doc); then one AFK implementation loop                                                                          |

---

## 2 · Unspoken needs (made explicit)

1. **Hero must look expensive** without destroying V4 content below the fold
2. **Readable always** — every frame, reduced motion, mobile
3. **Smooth 60fps target on desktop mid hardware**; mobile must not melt battery
4. **Feels INTAFACED** (sovereign/terminal/lime) not generic purple Three.js portfolio
5. **Agent finishes without Nitro technical choices**
6. **Can kill/tune 3D with one flag** if it misbehaves
7. **Attribution correct**, no stolen Singularity code
8. **Peace of mind:** fallbacks + perf budget written **before** code

---

## 3 · Architecture (locked recommendation)

```
HeroSection
  ├── HeroCopy (existing Denon lines + CTAs + stats)  // z-20, pointer-events auto
  ├── HeroWaveCanvas (lazy)                            // z-0, pointer-events none on canvas wrapper except optional hover layer
  │     └── three + adapted wave-grid GLSL (MIT)
  └── HeroFallback (CSS grid / static gradient + subtle CSS wave)  // mobile / reduced-motion / no WebGL
```

| Choice      | Decision                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| Leverage    | **Adapt** franky-adl wave-grid (MIT), theme lime/void                                                                  |
| Singularity | Mood only (depth, pacing, restraint)                                                                                   |
| Torus       | **Default OFF** unless hero feels empty after wave-grid — one accent max                                               |
| Load        | `React.lazy` / dynamic `import('three')` only when hero mounts and WebGL OK                                            |
| Color       | Grid/wave materials → lime `#c6ff3d` + dark void; no rainbow                                                           |
| Interaction | Pointer drives ripple **without** blocking CTA clicks (canvas `pointer-events: none` OR hit-area only behind copy gap) |
| Mobile      | **No full 40×40 interactive grid** by default — CSS/ambient fallback or very low poly static wave                      |
| Kill switch | `VITE_HERO_3D=0` or `const HERO_3D_ENABLED = true`                                                                     |

---

## 4 · Performance budget (non-negotiable)

| Budget                 | Target                                                                       |
| ---------------------- | ---------------------------------------------------------------------------- |
| Initial JS for hero 3D | Dynamic import; not in critical path of first paint text                     |
| DPR                    | `min(devicePixelRatio, 1.5)` desktop; `≤ 1.25` mobile if 3D ever on          |
| Grid size              | Desktop start ≤ 40×40 if source; drop to 24×24 if FPS &lt; 45                |
| FPS                    | Prefer pause when `document.hidden` or IntersectionObserver &lt; 10% visible |
| Lights/post            | Minimal; no stack of bloom+DOF+SSAO unless free and proven cheap             |
| Lighthouse feel        | Text LCP = headline (not canvas); canvas must not delay fonts/copy           |
| Bundle                 | three tree-shaken where possible; no lil-gui in prod build                   |

**Lag = fail.** Beauty that janks is not premium.

---

## 5 · Fallback matrix

| Condition                        | Behavior                                           |
| -------------------------------- | -------------------------------------------------- |
| `prefers-reduced-motion: reduce` | Fallback only; no continuous wave sim              |
| No WebGL / context lost          | Fallback; log once in dev                          |
| Init throw                       | Fallback; never blank hero                         |
| Mobile width &lt; 768            | Fallback by default (tune only if measured 50fps+) |
| Hero offscreen                   | `renderer.setAnimationLoop(null)` or pause         |
| Tab hidden                       | Pause                                              |

---

## 6 · Scope of files (surgical)

**In scope:**  
`sites/sovereign-os/src/components/hero/*`, App hero section wiring, package.json deps (`three` + types), NOTICE/MIT credit, STACK-LOCK update, deploy Pages dist

**Out of scope:**  
Rest of V4 page rewrite · Advanced Charts · monorepo product shell · payments apex · ASCII project unless used as micro-accent only

---

## 7 · Acceptance criteria (done = all true)

1. Desktop: wave-grid style 3D visible, **themed**, interactive, no GUI
2. Headline + both CTAs readable in all animation states (screenshot proof)
3. Mobile: no laggy 3D; fallback looks intentional
4. Reduced motion: no continuous 3D
5. WebGL fail: still full hero content
6. Clicks on CTAs work 100%
7. MIT attribution present
8. `npm run build` green in `sites/sovereign-os`
9. Live Pages updated; hard-refresh shows new hero
10. STACK-LOCK names 3d-wave-grid + paths

---

## 8 · Process (greenlit run)

1. Worktree only (`tv-sovereign-os-site` or fresh `pnpm wt`)
2. Read current `App.tsx` hero
3. Vendor-adapt wave-grid (not iframe whole app)
4. Wire lazy hero + fallbacks
5. Build + local visual check
6. Deploy `dist` → ZenYoda3/intafaced-sovereign-os Pages
7. Optional monorepo PR if source should land on intafaced branch
8. Scoreboard update

**Skip:** inventing LIVE-LANES drama for a marketing package; full monorepo verify unless monorepo root touched.

---

## 9 · Enhanced builder prompt (use this, not the raw agent paste)

```markdown
# BUILD: Premium 3D wave-grid hero for INTAFACED Sovereign OS (V4 site)

## Mission

Upgrade the **existing** marketing site hero in `sites/sovereign-os` with a production-ready interactive 3D wave-grid background adapted from MIT **franky-adl/3d-wave-grid**, themed to INTAFACED (void + lime), with cinematic restraint inspired by singularity.misterprada.com — **without lag, without covering copy/CTAs, without a second app**.

## Source of truth

- Live: https://zenyoda3.github.io/intafaced-sovereign-os/
- Code: monorepo worktree package `sites/sovereign-os` (Vite React TS Tailwind)
- Leverage primary: https://github.com/franky-adl/3d-wave-grid (MIT) — **adapt**, don’t dump
- Inspiration only (no proprietary code): https://singularity.misterprada.com/
- Optional accent only if needed: distorted-torus demo (restraint)
- Plan: docs/ops/HERO-3D-WAVE-GREENLIGHT-PLAN-2026-08-10.md

## Do not follow monorepo cargo-cult blindly

- This is **not** the vendor exchange shell. Do not invent a second SPA.
- Prefer `npm run build` inside `sites/sovereign-os`. Full monorepo `pnpm verify` only if you touch monorepo root packages.
- Marketing site: no fake prices, no partner names, no money UI under the effect.

## Non-negotiables (unspoken → explicit)

1. Existing Denon hero copy + CTAs + stats **preserved** (wording unless unreadable on new BG)
2. Copy/CTA contrast always pass; z-index hierarchy: copy above canvas
3. Canvas must not steal clicks from CTAs
4. Mobile: lightweight fallback by default
5. prefers-reduced-motion → fallback
6. WebGL fail → fallback, never empty hero
7. Pause when offscreen / tab hidden
8. DPR capped; quality scales down if FPS poor
9. Lazy-load three.js
10. Strip lil-gui / stats from production
11. MIT attribution for 3d-wave-grid
12. Kill switch to disable 3D
13. No layout shift; no scroll trap
14. Theme lime/void — not demo defaults
15. Rest of V4 page below hero stays intact

## Architecture

HeroSection = HeroCopy + lazy HeroWaveCanvas + HeroFallback  
Implement modular files under `src/components/hero/`.

## Performance budget

See greenlight plan §4. Lag = fail. Prefer fewer cubes / simpler shader over pretty jank.

## Workflow

1. Worktree only; never main checkout push to main
2. Inspect current hero in App.tsx
3. Read 3d-wave-grid source + LICENSE; plan port points (scene, grid, shaders, pointer)
4. Implement + wire
5. `npm run build` green
6. Visual check desktop + mobile + reduced motion + no-WebGL simulation
7. Deploy dist to GitHub Pages (ZenYoda3/intafaced-sovereign-os)
8. Update STACK-LOCK + scoreboard
9. Optional: commit/push feat branch with Prettier clean

## Done definition

All acceptance criteria in greenlight plan §7. Report live URL + what fallback does + MIT credit path.

## Explicit anti-slop

Not “Three.js wallpaper.” Must feel intentional, premium, readable, fast, and on-brand.
```

---

## 10 · Greenlight checklist (Nitro)

- [ ] OK to add **Three.js** (lazy) for desktop hero
- [ ] OK **mobile = non-3D fallback** (recommended)
- [ ] Primary look = **wave grid** (MIT), Singularity = mood only
- [ ] Torus accent **off unless needed**
- [ ] Ship to **same Pages URL**

**Reply:** `go hero 3d` · `hold` · or change (e.g. “3D on mobile too” / “no three.js”)

---

_No implementation until greenlight._
