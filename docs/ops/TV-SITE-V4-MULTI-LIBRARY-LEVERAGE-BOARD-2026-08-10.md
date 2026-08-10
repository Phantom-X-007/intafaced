# V4 Multi-Library Leverage Board (2026-08-10)

**Status:** GREENLIGHT ADDENDUM · supersedes “Magic UI only” read of the prior kit  
**Parent:** [`TV-SITE-V4-GREENLIGHT-LEVERAGE-PLAN-2026-08-10.md`](TV-SITE-V4-GREENLIGHT-LEVERAGE-PLAN-2026-08-10.md)  
**Taste gates (mandatory before install):**

- `design-taste-frontend` skill — design read + dials + anti-slop
- `impeccable` skill — brand register, ban list, critique/polish
- **ui-ux-pro-max** — pattern lookup only, not palette dump

**Rule:** Magic UI stays **core**. Other libraries **add** what Magic is weak at. Taste filters **reject** anything that reads purple SaaS, bank fintech, or carnival motion.

---

## 0 · Why multi-library (your correction)

Magic UI is strong at marquees, tickers, beams, bento shells — but it is **not** the ceiling.  
React Bits / Aceternity free tier / Motion Primitives / Cult often win on **text kinetic**, **hero drama**, **background craft**, **card physics**.

**Fullest leverage = best component per job**, one visual system (lime/void), not five themes.

---

## 1 · Taste filter (applies to every install)

### Design read (locked for V4)

> Marketing product drop for Sovereign OS / traders / street culture: black glass + bright green + poster type + terminal/lobby density. Not bank. Not purple AI SaaS. Not empty stub. Not whitepaper.

### Dials

| Dial             | Value |
| ---------------- | ----- |
| DESIGN_VARIANCE  | 7–8   |
| MOTION_INTENSITY | 6     |
| VISUAL_DENSITY   | 7–8   |

### Auto-reject (even if “cool”)

- Default purple / indigo / multicolor rainbow CTAs
- Cream/sand SaaS light themes
- Identical 3-up feature cards as page identity
- Heavy WebGL / globe as mandatory hero (perf + slop)
- Gradient text as default
- More than **2** marquees
- Components that force light mode
- Anything that needs paid unlock mid-build (stay free tier / MIT / Apache)

### Auto-accept signals

- Dark-first demos
- Mono + display type friendly
- Copy-paste / own-the-code
- Works with Tailwind + motion
- Re-themeable with CSS variables in &lt;1 hour

---

## 2 · Library roles (who owns what)

| Library                        | Role on THIS site                                                                      | Use heavily?        | Avoid                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------- |
| **Magic UI**                   | Core motion primitives: marquee, number ticker, border beam, bento shell, grid ambient | **Yes — keep**      | Using it for every hero text effect if React Bits is better |
| **React Bits**                 | Kinetic text, scroll/text splits, background craft, interactive polish                 | **Yes — major add** | Over-stacking 3D / party effects                            |
| **Aceternity UI (free)**       | Spotlight, background beams, card hover, select hero backgrounds                       | **Selective**       | Whole Aceternity template look; paid-only blocks            |
| **Motion Primitives**          | Scroll reveals, text primitives, micro-interactions (shadcn registry)                  | **Selective**       | Duplicating Magic/Bits same effect twice                    |
| **Cult UI**                    | Shift/hover cards, animated bento variants, dark CTA blocks                            | **Selective**       | AI-chat agent chrome (wrong product surface)                |
| **shadcn/ui**                  | Tabs, accordion, sheet, button primitive                                               | **Yes — structure** | Default zinc skin                                           |
| **lightweight-charts**         | Trade proof chart                                                                      | **Yes — required**  | Replacing with fake div chart                               |
| **Phosphor**                   | Icons                                                                                  | **Yes**             | Mixing Lucide + Phosphor                                    |
| Origin UI / forms kits         | Only if waitlist form needs craft                                                      | Optional            | Making site form-heavy                                      |
| Untitled UI / HeroUI full kits | —                                                                                      | **No**              | Full DS lock-in for one marketing page                      |

---

## 3 · Expanded MUST kit (Magic + others)

### A · Keep from Magic UI (unchanged commitment)

| ID  | Component                        | Docs                                                 | Page job                 |
| --- | -------------------------------- | ---------------------------------------------------- | ------------------------ |
| M1  | Marquee                          | https://magicui.design/docs/components/marquee       | Ticker tape              |
| M2  | Number Ticker                    | https://magicui.design/docs/components/number-ticker | Hero stats               |
| M3  | Border Beam                      | https://magicui.design/docs/components/border-beam   | Trade + blueprint frames |
| M4  | Bento Grid                       | https://magicui.design/docs/components/bento-grid    | Rooms map shell          |
| M5  | Blur Fade                        | https://magicui.design/docs/components/blur-fade     | Section enter            |
| M6  | Grid / Dot / Flickering (pick 1) | magicui.design/docs/components/\*                    | Ambient                  |

### B · ADD from React Bits (premium text + presence)

| ID     | Component class                                                                  | Source                                                          | Page job                   | Taste note                               |
| ------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------- | ---------------------------------------- |
| **R1** | Split / blur / scroll text (e.g. BlurText, SplitText family)                     | https://reactbits.dev · https://github.com/DavidHDev/react-bits | Hero + manifesto headlines | Poster energy Magic often under-delivers |
| **R2** | Background effect (pick 1 dark-friendly: particles/grid/waves **low** intensity) | reactbits.dev backgrounds                                       | Hero depth                 | Density 7–8; not carnival                |
| **R3** | Card / hover interactive (tilt or spotlight-class if available)                  | reactbits.dev                                                   | Law panels or plane cards  | Prefer over flat divs                    |
| **R4** | Scroll stack or sticky reveal (if fits Drop / path)                              | reactbits.dev                                                   | Drop phases OR chain path  | Max one scroll-hijack pattern            |

**Install model:** CLI/copy per React Bits docs; Tailwind/TS variants preferred.

### C · ADD from Aceternity free (cinematic select, re-theme)

| ID     | Component                                                   | Source                               | Page job                                               | Taste note                             |
| ------ | ----------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------ | -------------------------------------- |
| **A1** | Background Beams **or** Spotlight (pick one hero treatment) | https://ui.aceternity.com/components | Hero atmosphere behind type                            | Re-theme to lime; kill purple defaults |
| **A2** | 3D Card Effect **or** Card Hover/Spotlight Card             | aceternity components                | Blueprint card / Trade chrome optional                 | One 3D max                             |
| **A3** | Moving Border / similar free border motion                  | if free tier                         | Alternate to Magic Border Beam on **one** surface only | Don’t double-beam everything           |

**Hard rule:** Aceternity is **spice**, not the whole plate. If page starts looking like “every Aceternity demo site,” cut A2/A3.

### D · ADD from Motion Primitives

| ID     | Component                      | Source                        | Page job                                      |
| ------ | ------------------------------ | ----------------------------- | --------------------------------------------- |
| **P1** | Text / in-view primitives      | https://motion-primitives.com | Supporting reveals (not hero if R1 owns hero) |
| **P2** | Morph / dialog micro if needed | motion-primitives             | Optional CTA polish                           |

Prefer **shadcn add** registry path when available.

### E · ADD from Cult UI (selective)

| ID     | Component                                        | Source                  | Page job                        |
| ------ | ------------------------------------------------ | ----------------------- | ------------------------------- |
| **C1** | Shift Card / hover-expand card                   | https://www.cult-ui.com | “Inside the house” module cards |
| **C2** | Dark marketing CTA block (if free & rethemeable) | cult-ui                 | Close section only              |

**Skip:** AI agent chat UIs, Gemini editors, thought chains — wrong product.

### F · Structure + product proof (non-negotiable)

| ID     | Component                         | Source                                            | Page job               |
| ------ | --------------------------------- | ------------------------------------------------- | ---------------------- |
| **S1** | Tabs / Accordion / Sheet / Button | shadcn/ui                                         | Systems, depth, mobile |
| **S2** | Lightweight Charts                | https://github.com/tradingview/lightweight-charts | Trade terminal         |
| **S3** | Phosphor icons                    | npm @phosphor-icons/react                         | Marks                  |

---

## 4 · Section assignment (fullest without chaos)

| Section      | Primary leverage                                      | Secondary                |
| ------------ | ----------------------------------------------------- | ------------------------ |
| Hero         | **R1** text + **A1** or **R2** ambient + **M2** stats | Custom layout            |
| Ticker       | **M1** Marquee                                        | —                        |
| Manifesto    | **R1**/P1 text reveal                                 | Editorial grid           |
| Laws         | **R3** or **C1** cards                                | M5 enter                 |
| Planes       | Custom switcher + **A2**/R3 panels                    | Shine if needed          |
| Rooms        | **M4** Bento + room microcopy                         | Phosphor                 |
| Systems      | **S1** Tabs                                           | —                        |
| Trade        | **S2** LWC + **M3** Border Beam shell                 | Optional Terminal chrome |
| Chain path   | **R4** or simple rail + M5                            | —                        |
| Blueprint    | **A2** or M3 card                                     | —                        |
| Never        | Accordion or animated list                            | —                        |
| Drop         | Phase rail + light R4                                 | —                        |
| Inside house | **C1** + **S1** Accordion                             | Denon 1–2 liners         |
| Close        | **C2** or solid CTA + optional marquee                | —                        |
| Mobile       | **S1** Sheet                                          | —                        |

**Cap:** ≤ **1** heavy background effect · ≤ **1** 3D card type · ≤ **2** marquees · ≤ **1** scroll-hijack.

---

## 5 · Methodology — how taste repos run the kit

```
G0 design-taste: design read + dials + reject list
G1 impeccable: PRODUCT/DESIGN for sites/sovereign-os; brand register
G2 Content cards from Denon FULL (first paint + disclosure)
G3 Install kit per library (Magic + Bits + selective Ace/Cult/MP + shadcn + LWC)
G4 Theme tokens FIRST (void + lime) — re-skin every demos’ colors before placing
G5 Assemble page by section map
G6 impeccable critique → audit → polish once
G7 Screenshots + deploy
G-LEV multi-lib: STACK-LOCK lists every component ID M*/R*/A*/C*/P*/S* with path
```

**Theme-first rule:** No component ships in library default colors.  
**Taste veto:** design-taste + impeccable ban list beat “but it looked cool in the demo.”

---

## 6 · STACK-LOCK template (must fill on build)

```md
| ID | Library | Component | Local path | Section | Licence |
| M1 | Magic UI | Marquee | components/... | ticker | MIT |
| R1 | React Bits | … | … | hero | MIT |
| A1 | Aceternity | … | … | hero | MIT (free) |
...
| S2 | TradingView | lightweight-charts | … | trade | Apache-2.0 |
```

Missing IDs after build = **not done**.

---

## 7 · What changed vs prior greenlight

| Before                    | Now                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| Almost only Magic UI      | Magic **core** + React Bits + selective Aceternity + Motion Primitives + Cult + shadcn + LWC |
| Risk of samey Magic demos | Hero text/background can win from Bits/Ace                                                   |
| Weak taste enforcement    | Explicit taste filter + skill gates                                                          |

---

## 8 · Greenlight ask (updated)

Approve **multi-library kit** above (keep Magic, add Bits/Ace/Cult/MP selectively, shadcn+LWC required).

Reply: **`go V4 multi`** · **`hold`** · **`drop X`** / **`add Y`**

---

_Build still blocked until greenlight._
