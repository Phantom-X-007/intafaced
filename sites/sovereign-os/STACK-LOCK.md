# STACK-LOCK V4 multi (2026-08-10)

| ID    | Library                 | Component          | Local path                                 | Section           | Licence             |
| ----- | ----------------------- | ------------------ | ------------------------------------------ | ----------------- | ------------------- |
| M1    | Magic UI pattern        | Marquee            | `src/components/magicui/marquee.tsx`       | ticker / close    | MIT-style reimpl    |
| M2    | Magic UI pattern        | Number Ticker      | `src/components/magicui/number-ticker.tsx` | hero stats        | MIT-style + motion  |
| M3    | Magic UI pattern        | Border Beam        | `src/components/magicui/border-beam.tsx`   | trade / blueprint | MIT-style           |
| M4    | Magic UI pattern        | Bento Grid         | `src/components/magicui/bento-grid.tsx`    | rooms             | MIT-style           |
| M5    | Magic UI pattern        | Blur Fade          | `src/components/magicui/blur-fade.tsx`     | sections          | MIT-style + motion  |
| M6    | Magic UI pattern        | Grid Pattern       | `src/components/magicui/grid-pattern.tsx`  | ambient           | MIT-style           |
| R1    | React Bits pattern      | Split Heading      | `src/components/bits/split-heading.tsx`    | hero              | pattern + motion    |
| R2/A1 | Aceternity/Bits pattern | Background Beams   | `src/components/bits/background-beams.tsx` | hero              | pattern, lime theme |
| R3/A2 | Ace/Bits pattern        | Spotlight Card     | `src/components/bits/spotlight-card.tsx`   | laws / planes     | pattern             |
| C1    | Cult UI pattern         | Shift Card         | `src/components/bits/shift-card.tsx`       | inside house      | pattern             |
| S1    | shadcn/Radix            | Tabs / Accordion   | `src/components/ui/*`                      | systems / depth   | MIT                 |
| S2    | TradingView             | lightweight-charts | `src/components/trade-chart.tsx`           | trade             | Apache-2.0          |
| S3    | Phosphor                | icons              | package                                    | nav/mobile        | MIT                 |

## Theme

void `#050806` · lime `#c6ff3d` · all demos re-skinned (no purple)

## Caps

≤2 marquees · 1 heavy BG · 1 beam family · no Advanced Charts binary

## Hero 3D (2026-08-10)

| ID | Source | Path | Notes |
| H1 | franky-adl/3d-wave-grid MIT | src/components/hero/waveGridEngine.ts | adapted, lime/void, no GUI |
| H2 | same | HeroWaveCanvas (lazy) | DPR/quality scale, pause offscreen |
| H3 | fallback | HeroFallback | CSS grid when reduced-motion / no WebGL |
