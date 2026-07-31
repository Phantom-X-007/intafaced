# Color lock — P21 (provisional)

**Status:** provisional operator pick · 2026-07-31  
**Scope:** Stream A shell (`vendor/coinexchange/05_Web_Front` on `:8090`)  
**Board:** `docs/styleboard/VIEW-COLOR-PALETTES.html` → **P21 Deep neutral · teal**

## Verdict

Nitro locked **P21** for now. This is **not** a forever brand tattoo.

## Modular = easy to change later

| Layer | What it is | How you change palette |
| ----- | ---------- | ---------------------- |
| **Token source of truth** | `:root` in `vendor/coinexchange/05_Web_Front/src/assets/css/intafaced.css` | Edit the hex block once; chrome that uses `var(--ix-*)` / `var(--accent)` follows |
| **Legacy template hex** | Many Vue/CSS literals still carry brand colors (from historical `retheme.mjs`) | Re-run a brand remap (same class of pass used for P21) or gradually replace with CSS vars |
| **What does not change with brand** | Market **up/down** green/red | Left alone on purpose — traders read them as direction |

**Implication:** picking P21 now does not trap you. Swap to any other board id (P22–P36, P01–P20) by changing tokens (+ optional hex sync). Layout/density language is separate and can graft later.

## P21 values (locked values)

| Role | Hex |
| ---- | --- |
| bg | `#0a0c10` |
| panel | `#12151c` |
| border | `#242a34` |
| text | `#e8ebf0` |
| muted | `#8a909c` |
| accent | `#00c2a8` |
| on-accent | `#041210` |
| up | `#0ecb81` |
| dn | `#f6465d` |

Accent scale used in shell: light `#1ad4bc`, dark `#009e89`, hover `#33dcc8`.

## Name debt (deliberate)

CSS still uses `--ix-orange*` **names** so existing call sites do not break. **Values** are teal. Rename to `--ix-accent*` in a later cleanup if desired — not required for modularity.

## Out of scope this lock

- Full dual-tone layout / density language (Wave B craft)
- Pure-black logo art beyond simple fill remaps
- `apps/web` (not Stream A)

## Proof of modularity for Nitro

You can reverse or re-pick by saying another palette id; agent changes the token block (and remaps leftover brand hex if needed). No rebuild of the product around a color.
