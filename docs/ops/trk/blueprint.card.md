# TRK-blueprint.card

**Title:** Share card render (1080×1350, 1200×630)  
**Tracker:** `blueprint.card` · phase 4 · plane F · status `ready` · owner none  
**Depends on:** `blueprint.onboarding` (done) · **requires:** `services/svc-blueprint`  
**Tip freeze:** `origin/main` @ `c773dafa` (re-derive before implement)  
**Pack type:** research only — no implement; no `features.mjs` edit; no money invention.

## DoD (plain language)

A user with a Blueprint can fetch a **share card** at both §7.2 sizes
(1080×1350 portrait and 1200×630 landscape). Composition always works offline
as SVG (no personal data: no name, id, or date). When a real rasterizer +
object storage exist, a **hosted PNG URL** is written to `card_asset_url` and
safe for social unfurl. Without that rail, the API returns honest
`raster: { status: "unavailable", code: "blueprint.card_renderer_unconfigured" }`
— never a fabricated asset URL.

## Path on tip

| Area           | Location                                                                      |
| -------------- | ----------------------------------------------------------------------------- |
| Service        | `services/svc-blueprint/`                                                     |
| Compose (done) | `src/card/compose.ts` — pure profile+crew → SVG                               |
| Adapter (§0.4) | `src/card/card-renderer.ts` · `HttpCardRenderer` · `UnconfiguredCardRenderer` |
| Procedure      | `blueprint.card` (blueprint:read, self-only) + §7.2 export carries card       |
| Env            | `BLUEPRINT_CARD_RENDERER_URL` · timeout · optional API key                    |
| DB             | `blueprints.card_asset_url` — written **only** on real raster success         |

**Tip residual:** SVG composition + brand/size/determinism tests **ship**. PNG
half is the rail: default boot is unconfigured; no hosted PNG in this env.
Owner product call still open: may a user display name appear on the card?

## Blocked by

| Blocker               | Notes                                                                      |
| --------------------- | -------------------------------------------------------------------------- |
| Raster rail + storage | External renderer URL + object store that returns a durable public PNG URL |
| Product law (human)   | Display-name-on-card abuse surface — Nitro/Denon call                      |
| Not blocked           | Onboarding, SVG compose, contracts `CARD_DIMENSIONS`, brand scan on output |

Not Shehzad M1–M7. Not money spine. Class N/P craft for wiring a real
renderer once infrastructure exists; Class X only for vendor secrets if any.

## First PR size (if free)

**S after rail exists:** point `BLUEPRINT_CARD_RENDERER_URL` at a real
rasterizer in non-prod; prove `blueprint.card` returns `raster.status: ok` +
non-null `card_asset_url`; golden test that unconfigured path still refuses
URL invent. **Without rail:** Class N docs only (this pack) — do **not** mark
mountain `done`. Do not stub a fake CDN URL for og:image.
