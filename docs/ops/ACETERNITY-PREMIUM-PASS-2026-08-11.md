# Aceternity premium pass - INTAFACED Sovereign OS site

**Date:** 2026-08-11  
**Site:** `sites/sovereign-os` · branch `feat/tv-sovereign-os-apply-site` · Pages `ZenYoda3/intafaced-sovereign-os`  
**Library:** [ui.aceternity.com/components](https://ui.aceternity.com/components) (own-code copy, MIT-style free registry)

## Design read

Exchange-first marketing for pro traders. Brand language is **void + lime** (#050806 / #c4f000), desk/cockpit density, no AI-purple / cyan demo defaults. Aceternity is the spice layer - not a second brand.

**Dials:** variance 7 · motion 7 · density 5  
**Rule:** retheme fully. Never ship registry demo colors. Cap spice so the terminal and Glare Blueprint stay the product heroes.

## Placement map (ship this wave)

| Component                              | Section                               | Role                                                   | Why here (not elsewhere)                                                         |
| -------------------------------------- | ------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **Floating Dock**                      | Global fixed bottom                   | Section jumps (Trade, Seats, Rooms, Planes, Drop, Key) | Mac-magnify nav for a long single page; top header keeps brand + primary CTA     |
| **Background Beams** (full motion SVG) | Hero fallback + Close `#key`          | Path-following lime beams                              | User-named; premium over static diagonal lines; hero 3D still wins when WebGL ok |
| **Spotlight New**                      | Close `#key`                          | Soft dual lime light cones behind CTA                  | Marks the conversion moment without fighting the chart                           |
| **Text Generate Effect**               | Close headline                        | Word-by-word blur reveal                               | One cinematic line at the end - not every H2                                     |
| **Flip Words**                         | Hero sub-line                         | Spot / Perps / Options / OTC                           | Product menu in motion - exchange-native, not decorative nonsense                |
| **Moving Border**                      | Hero primary CTA shell                | Lime traveling border on OPEN THE TERMINAL             | Premium control without replacing solid lime fill                                |
| **Hover Border Gradient**              | Hero secondary CTA                    | SEE THE FULL HOUSE                                     | Paired polish, lime highlight (not #3275F8)                                      |
| **Glowing Effect**                     | Exchange terminal outer frame         | Cursor-style adaptive border on the desk               | Product surface gets the expensive interaction                                   |
| **Meteors**                            | Drop phases                           | Subtle lime streaks                                    | Drop metaphor; low count; not sparkles                                           |
| **Encrypted Text**                     | Never-list intro or one doctrine line | Scramble → reveal on view                              | Fits "never sell you / never dress custody" - security grammar                   |
| **Glare Card**                         | Blueprint (already shipped)           | Share-card foil                                        | Keep - Denon identity product                                                    |

## Explicitly NOT this wave

| Skip                                                 | Reason                                                  |
| ---------------------------------------------------- | ------------------------------------------------------- |
| Sparkles / Aurora / Gemini / Vortex / Wavy           | AI-slop fingerprint or color fight with brand           |
| Globe / World map                                    | Not exchange-first                                      |
| Sticky Scroll Reveal                                 | InsideScroll + orbital rooms already own scroll stories |
| Lamp / Macbook scroll / Container scroll             | Wrong metaphor or paid/registry risk                    |
| Card Hover Effect grid                               | Would reintroduce equal-card rails we killed            |
| Tracing Beam on chain                                | ChainTimeline is already a distinct layout family       |
| Stacking beams + meteors + spotlight on same section | One hero motion per section max                         |

## Theme law (every port)

1. Gradients: lime family only (`#c4f000`, `#8ab000`, soft rgba lime). No `#18CCFC` / `#6344F5` / `#AE48FF` / sky blue.
2. Surfaces: `void` / `panel` / `line` / `ink` / `mute` tokens from `index.css`.
3. Icons: **Phosphor only** (no new `@tabler/icons-react` dep).
4. Corners: brand is sharp-ish on product chrome; dock may keep rounded glass (Mac pattern is the product of that component).
5. `prefers-reduced-motion`: freeze beams/meteors/flip cycles; keep content readable.
6. No dual full-opacity black flash (SiteLoader law unchanged).
7. Demo vs real labels stay honest on terminal candles.

## Integration order (build)

1. UI primitives under `src/components/ui/*` (themed ports).
2. Replace lightweight `bits/background-beams` with full beams (HeroFallback keeps import path).
3. `SiteDock` + App close section (beams + spotlight + text generate).
4. Hero (flip words + moving/hover border CTAs).
5. Terminal frame glowing effect.
6. Drop meteors + Never encrypted accent.
7. Build · preview · deploy Pages · bank monorepo docs.

## Success criteria (Nitro check)

- Bottom dock magnifies on hover; jumps work on phone too.
- Close section feels "premium night desk" not purple SaaS.
- Terminal frame glows on pointer near the desk.
- Hero market words flip; primary CTA has traveling lime edge.
- Nothing looks like an Aceternity demo dump (no cyan, no equal card wall).

## Provenance

Sources pulled from Aceternity free registry JSON (`ui.aceternity.com/registry/*.json`), adapted in-repo. Glare Card already cited on component file.
