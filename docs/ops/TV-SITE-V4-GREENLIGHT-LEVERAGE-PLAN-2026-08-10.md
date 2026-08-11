# V4 Greenlight Plan — Leverage Board + Full Methodology (2026-08-10)

**Status:** AWAITING NITRO GREENLIGHT · no build until go  
**Live baseline (v3 — too thin):** https://zenyoda3.github.io/intafaced-sovereign-os/  
**Copy bible:** `docs/copy/SOVEREIGN-OS-LANDING-COPY-DENON-FULL.md` (worktree) / Denon pack  
**Prior needle:** [`TV-SITE-V4-NEEDLE-PLAN-AND-PROMPT-2026-08-10.md`](TV-SITE-V4-NEEDLE-PLAN-AND-PROMPT-2026-08-10.md)  
**This file wins for:** what leverage we install, how methodology is enforced, greenlight checklist

---

## 0 · One-sentence plan

Build **V4 as a premium product drop** of Sovereign OS for TradingView review: Denon’s empire **shown** (not dumped, not deleted), using a **locked internet-leverage kit + mandatory craft skills** so we cannot “compromise into a stub” again.

---

## 1 · Unspoken needs → plan requirements

| #   | Unspoken need                       | Plan enforces                                                                       |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| U1  | Looks premium on phone in 10s       | Hero craft + 3 signature screens; density 7–8                                       |
| U2  | Denon not ignored                   | Spine sections + “Inside the house” disclosure from his pack                        |
| U3  | Not AI text wall                    | First-paint copy budgets; depth behind disclosure                                   |
| U4  | Not empty poster (v3)               | Rooms have roles; planes interactive; trade chart real; path/drop/blueprint present |
| U5  | Internet leverage used **for real** | **§2 kit is mandatory** — STACK-LOCK must list each; missing = fail CI self-check   |
| U6  | Agreed skills used                  | Gate G0 before code: impeccable + design-taste loaded + design read written         |
| U7  | TV apply still works                | Public HTTPS; exchange/OS face; LWC only pre-grant; no payments primary             |
| U8  | AFK without craft starvation        | Parallel content deck + component install; single writer UI; one polish pass        |
| U9  | No v2↔v3 thrash                     | Middle-path architecture frozen below                                               |
| U10 | You greenlight leverage first       | This doc’s §2 is the board; build starts only after “go V4”                         |

---

## 2 · INTERNET LEVERAGE BOARD (show before go)

### 2.1 Stack decision (locked recommendation)

| Layer      | Pick                                                          | Why                                                                  | Licence       |
| ---------- | ------------------------------------------------------------- | -------------------------------------------------------------------- | ------------- |
| App shell  | **Vite + React + TypeScript**                                 | Magic UI / shadcn / motion are React-native; static export for Pages | MIT ecosystem |
| Style      | **Tailwind CSS v4**                                           | Required by Magic UI / shadcn copy-paste path                        | MIT           |
| Primitives | **shadcn/ui** (Tabs, Accordion, Sheet)                        | Own the code; re-skin hard                                           | MIT           |
| Motion     | **motion** (`motion/react`)                                   | Magic UI peer; intensity 6                                           | MIT           |
| Charts     | **lightweight-charts** (npm)                                  | Real TV-family chart; Apache-2.0; **not** Advanced Charts            | Apache-2.0    |
| Icons      | **@phosphor-icons/react**                                     | Taste skill allow-list; one family                                   | MIT           |
| Host       | GitHub Pages (current) → optional `trade.intafaced.com` later | Already live path                                                    | —             |

**Kill list (explicit):** full Aceternity paid template, three.js globe as hero, Inter default identity, purple gradients, Advanced Charts package, vendor logo walls.

---

### 2.2 Component kit — MUST USE (fan-out result)

Every row is **required in V4**. “Nice if time” is banned for this table.

| ID      | Component / pattern                       | Source (official)                                                                                                                                                                                                   | Where on page                                                | Job for THIS product                                            | Re-theme rule                                |
| ------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------- |
| **L1**  | **Marquee**                               | [Magic UI Marquee](https://magicui.design/docs/components/marquee)                                                                                                                                                  | Under hero + optional close strip (≤2)                       | Street tape / settlement ticker (Denon live ticker energy)      | Lime on void; mono                           |
| **L2**  | **Number Ticker**                         | [Magic UI Number Ticker](https://magicui.design/docs/components/number-ticker)                                                                                                                                      | Hero stat strip (12 / 28 / 30 / 10 / 2 / 1)                  | Empire scale without fake “SaaS metrics hero” as whole identity | Mono lime numbers                            |
| **L3**  | **Border Beam**                           | [Magic UI Border Beam](https://magicui.design/docs/components/border-beam)                                                                                                                                          | Trade terminal chrome + Blueprint card                       | Premium “powered” frame on product proof surfaces               | Lime beam only                               |
| **L4**  | **Bento Grid**                            | [Magic UI Bento Grid](https://magicui.design/docs/components/bento-grid)                                                                                                                                            | Twelve rooms (+ maybe systems)                               | OS map with visual hierarchy (Trade larger)                     | Asymmetric sizes; not 12 equal empty tiles   |
| **L5**  | **Blur Fade**                             | [Magic UI Blur Fade](https://magicui.design/docs/components/blur-fade)                                                                                                                                              | Section enter                                                | Motion intensity 6 without scroll circus                        | respect reduced-motion                       |
| **L6**  | **Text Animate** or **Text Reveal**       | [Magic UI Text Animate](https://magicui.design/docs/components/text-animate) / [Text Reveal](https://magicui.design/docs/components/text-reveal)                                                                    | Hero H1 lines only                                           | Poster energy on Denon three lines                              | No gradient text; solid lime span max 1 line |
| **L7**  | **Animated Grid / Dot / Flickering Grid** | [Grid Pattern](https://magicui.design/docs/components/grid-pattern) / [Dot Pattern](https://magicui.design/docs/components/dot-pattern) / [Flickering Grid](https://magicui.design/docs/components/flickering-grid) | Hero ambient (pick **one**)                                  | Terminal lobby atmosphere                                       | Low opacity; not purple aurora               |
| **L8**  | **Shine Border** or **Magic Card**        | [Shine Border](https://magicui.design/docs/components/shine-border) / [Magic Card](https://magicui.design/docs/components/magic-card)                                                                               | Plane cards + law panels                                     | Hover depth on dual-plane story                                 | 1 effect family, not both everywhere         |
| **L9**  | **Terminal** (Magic UI)                   | [Magic UI Terminal](https://magicui.design/docs/components/terminal)                                                                                                                                                | Optional custody-scan / “provably non-custodial” proof strip | Architecture trust as UI, not paragraph                         | Mono; short lines from Denon                 |
| **L10** | **shadcn Tabs**                           | [ui.shadcn.com tabs](https://ui.shadcn.com/docs/components/tabs)                                                                                                                                                    | Systems (Identity / Balance / Token)                         | Denon three shared systems                                      | Full reskin                                  |
| **L11** | **shadcn Accordion**                      | [ui.shadcn.com accordion](https://ui.shadcn.com/docs/components/accordion)                                                                                                                                          | “Inside the house” depth modules                             | Honor rest of Denon pack without scroll death                   | Title + 1–2 lines only per item              |
| **L12** | **shadcn Sheet**                          | [ui.shadcn.com sheet](https://ui.shadcn.com/docs/components/sheet)                                                                                                                                                  | Mobile nav                                                   | Clean phone UX                                                  | —                                            |
| **L13** | **Lightweight Charts**                    | [github.com/tradingview/lightweight-charts](https://github.com/tradingview/lightweight-charts)                                                                                                                      | Trade section                                                | Real chart proof for TV reviewers                               | Dark theme; demo labeled                     |
| **L14** | **Phosphor icons**                        | `@phosphor-icons/react`                                                                                                                                                                                             | Room marks / nav / CTAs sparingly                            | Not Lucide default soup                                         | One weight                                   |

**Magic UI home / install model:** https://magicui.design/docs/components — copy-paste into repo (MIT); peer Tailwind + motion.

**Optional only if craft needs after L1–L14 (not instead of):**

- Scroll Progress (thin top) — Magic UI
- Animated List — for Never lines
- Particles — **default OFF** (perf; enable only if polish pass needs)

---

### 2.3 Section → leverage map (build cannot skip rows)

| Page section | Denon                     | MUST use                                 |
| ------------ | ------------------------- | ---------------------------------------- |
| Hero         | HERO lines + stats        | L6 + L2 + L7 + CTAs                      |
| Ticker       | Live ticker               | L1                                       |
| Manifesto    | I condensed               | Editorial layout + L5                    |
| Laws         | Three laws                | L8 panels (asymmetric)                   |
| Planes       | II                        | L8 + custom switcher                     |
| Rooms        | V all 12 + one-line roles | **L4 Bento** (Trade featured cell)       |
| Systems      | VI                        | **L10 Tabs**                             |
| Trade        | VII                       | **L13 Chart** + **L3 Border Beam** shell |
| Chain path   | III P0–P3                 | Custom path rail (simple) + L5           |
| Blueprint    | XVI card                  | **L3** card composition                  |
| Never        | XXIII top 6–8             | L11 or Animated List                     |
| Drop         | XXIV phases               | Phase rail chips                         |
| Inside house | VIII–XX compressed        | **L11 Accordion**                        |
| Close        | CLOSE                     | L1 optional + primary CTA                |
| Mobile       | —                         | **L12 Sheet**                            |

---

### 2.4 How we guarantee leverage is actually used (not “planned then skipped”)

| Gate        | Check                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------- |
| **G-LEV-1** | `sites/sovereign-os/STACK-LOCK.md` lists L1–L14 with import paths after install                |
| **G-LEV-2** | `rg` proof: marquee, NumberTicker/border-beam or equivalent file paths exist under components/ |
| **G-LEV-3** | Live Trade section loads chart (network: lightweight-charts)                                   |
| **G-LEV-4** | Scoreboard line: “Leverage audit PASS” with list                                               |
| **Fail**    | Any spine section built as plain text blocks only → not done                                   |

---

## 3 · Methodology (skills — mandatory sequence)

### G0 · Before any UI code (blocks build)

1. **design-taste-frontend**

   - Write design read (one line)
   - Lock dials: variance **7–8**, motion **6**, density **7–8**
   - Anti-default ban list active

2. **impeccable**

   - Load skill; run context for `sites/sovereign-os`
   - Refresh PRODUCT.md / DESIGN.md
   - Follow brand register for marketing page
   - After build: **critique → audit → one polish** (not infinite)

3. **Internet leverage law spirit**

   - Prefer L1–L14 over freehand
   - Name leverage in PR/scoreboard

4. **Content deck** (from Denon FULL)
   - File: `sites/sovereign-os/CONTENT-CARDS.md`
   - Each spine section: first-paint lines + disclosure lines
   - **No raw dump of full pack into page**

### Build waves

| Wave   | Work                                    | Parallel?      | Exit                  |
| ------ | --------------------------------------- | -------------- | --------------------- |
| **W0** | Content cards from Denon                | Alone          | CONTENT-CARDS.md      |
| **W1** | Scaffold Vite/React/TW + install L1–L14 | After W0 start | STACK-LOCK filled     |
| **W2** | Page assembly per §2.3                  | After W1       | All sections render   |
| **W3** | impeccable critique/audit/polish        | After W2       | Notes in scoreboard   |
| **W4** | Screenshots 1440/390 + deploy Pages     | After W3       | Live URL V4           |
| **W5** | Apply pack URL refresh                  | After W4       | TV-APPLY-PACK updated |

**Single writer** on site package. No dual agents on same files.

---

## 4 · Content completeness (middle path — frozen)

### First paint (must feel like empire)

Hero · Manifesto (short) · Laws · Planes · Rooms (12 + roles) · Systems tabs · Trade+chart · Chain P0–P3 · Blueprint · Never (top) · Drop phases · Close

### Disclosure (must exist so Denon isn’t “missing”)

Inside the house accordion: Execution · Bank · Rails · P2P · Launch · Predict · Agents · Academy · Token/flywheel · Core — **title + 1–2 Denon-true lines each**

### Explicitly NOT full-page essays

Quant SDK walls, thirty-stream catalogs, full legalistic custody chapters (banner + bullets only on first paint)

---

## 5 · Quality / anti-compromise rules

| Rule                | Meaning                                                                            |
| ------------------- | ---------------------------------------------------------------------------------- |
| No thrift-as-stub   | Static export OK; craft not optional                                               |
| No panic minimalism | Cutting essay ≠ cutting rooms/planes/trade/chain/blueprint                         |
| No dump             | Full pack stays in docs/copy; page uses cards                                      |
| Premium bar         | First screen “not vibe-coded”; type self-hosted or next-level pair; lime committed |
| TV bar              | Public HTTPS; labeled demo chart; no Advanced Charts binary                        |
| Screenshots         | Hero + rooms bento + trade terminal (desktop + mobile)                             |

---

## 6 · Risks

| Risk                    | Mitigation                                                     |
| ----------------------- | -------------------------------------------------------------- |
| Magic UI default purple | Theme tokens first; ban ship if purple remains                 |
| Bundle bloat            | Only L1–L14; particles off by default                          |
| pnpm/env pain           | Vite+npm with local cache; document                            |
| Time sink motion        | Motion 6; one polish pass                                      |
| Over-accordion          | First paint spine still complete without opening any accordion |

---

## 7 · What you are greenlighting

When you say **go V4**, you approve:

1. **Stack:** Vite + React + TW + shadcn + Magic UI kit (L1–L14) + LWC + Phosphor
2. **Architecture:** middle-path content spine + disclosure
3. **Methodology:** design-taste + impeccable + leverage gates G-LEV-1…4
4. **Outcome:** replace thin v3 on GitHub Pages with premium V4; refresh apply pack URL

You are **not** greenlighting Advanced Charts install, DNS (unless separate), or Denon full-text dump.

---

## 8 · Greenlight checklist (Nitro)

- [ ] Leverage board §2 looks right (components make sense for OS/trade/street)
- [ ] Kill list OK (no purple template, no Advanced Charts pre-grant)
- [ ] Middle path OK (not v2 dump, not v3 stub)
- [ ] Skills sequence OK (taste + impeccable mandatory)
- [ ] **Go V4** / hold / change kit

---

## 9 · After go — FINISHED looks like

```
FINISHED V4
URL: …
Leverage audit: L1–L14 PASS
Denon spine: first-paint + disclosure listed
Screenshots: paths
Apply pack: updated
You: submit TV when ready · optional trade. DNS
```

---

_No build until greenlight. This file is the leverage commitment._
