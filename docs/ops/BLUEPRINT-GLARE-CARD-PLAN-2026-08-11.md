# Blueprint Glare Cards — plan (2026-08-11)

## Where it lives

- Section id: `#blueprint`
- Nav: **Seats**
- Component: Aceternity Glare Card (own-code) + `BlueprintCards.tsx`
- Art slots: `public/media/identity/{founding,night,scout}.jpg`

## What “full leverage” means for Glare Card

| Capability                  | Using it? | Note                      |
| --------------------------- | --------- | ------------------------- |
| Pointer foil glare          | Yes       | Full surface              |
| 3D tilt (rotate X/Y)        | Yes       | Strengthened vs stock     |
| Image full-bleed under foil | Yes       | Identity art              |
| Multiple cards              | Yes       | 3 seats (expandable)      |
| Fixed aspect 17/21          | Yes       | Pass / trading-card ratio |
| Children freeform layout    | Yes       | Rank + traits + brand     |

**Not in the stock component** (don’t invent as if free): flip reverse, drag stack, multi-face deck shuffle. Those would be _extra_ systems on top.

## Recommended direction (card game, not a form)

1. **Big hand** — 3 large cards (~380–420px), not 300px widgets.
2. **Active focus** — hover/select pops one card (scale) so glare reads clearly.
3. **Rank strip** — FOUNDING / NIGHT / SCOUT selectors under the hand.
4. **Your Pinterest stills** — drop into the three art slots; no layout rewrite.
5. **Optional later** (only if you want): 4th–5th seats, or a single “hero” card above a smaller fan.

## What we keep (no wipe)

- GlareCard source + foil math
- Seat data model (rank, traits, image path)
- Identity copy framework

## What waits on you

- Pinterest / art for founding · night · scout (or more seats if you expand the set)
