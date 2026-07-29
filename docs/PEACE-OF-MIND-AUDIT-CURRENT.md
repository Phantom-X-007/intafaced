# Peace of mind — current floor (Nitro)

**Date:** 2026-07-29  
**Main tip:** `88e5e33` (includes audit #80 + #81)  
**Claim tags:** `[VERIFIED 2026-07-29]` audit program closed on main

Older July-27 peace/status docs are **history** — this file is the trust floor.

---

## Verdict (one breath)

Denon built a **real startable platform** (edge, mounts, money path, deploy, terminal, DEX shell). A full post-merge audit found real open doors; **they are fixed on main** (#80, #81). Remaining risk is **named**, not mystery: go-live needs real rails/chain; **L2-6** S2S body-bind is deferred.

**You can let Denon keep building.** After each Denon wave: [`WAVE-AUDIT.md`](WAVE-AUDIT.md) only — not a full re-audit.  
**Do not go live with real user money** until real rails + host perimeter + operator kill path.

---

## Scoreboard

| System                   | Risk now                                     | Status               |
| ------------------------ | -------------------------------------------- | -------------------- |
| Ledger                   | Low if perimeter holds                       | OK to build          |
| Identity                 | Open XP mint fixed                           | OK                   |
| Pay                      | IDOR + withdraw crash fixed                  | OK                   |
| Token / bank earn        | Claim-order + purpose pots fixed             | OK                   |
| P2P                      | Purpose escrow + party-only reads fixed      | OK                   |
| Edge                     | Region bound into principal HMAC             | OK for dev           |
| Protocol / DEX / indexer | Mounted shells; chain propped                | Not product-complete |
| Deploy                   | One-command platform; S2S not host-published | Usable with care     |
| Vendor                   | High if used as money                        | **Quarantined**      |
| CI doctrine              | Was red after vendor; fixed                  | OK                   |

---

## Closed by this audit (on main)

- Protocol `/trpc` mount · awardXp service-only · pay ownership · internal HMAC
- Withdraw reverse durability · stake/earn pending→active
- Purpose-keyed escrow + stake pots · region HMAC · P2P read IDOR
- S2S ports not on host · RUNNING/protocol UI honesty · tracker done evidence

**PR proof:** [#80](https://github.com/Phantom-X-007/intafaced/pull/80) · [#81](https://github.com/Phantom-X-007/intafaced/pull/81)

---

## Still open (short list)

| Item                                                     | When it matters                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| **L2-6** S2S body-bind (raw-body design)                 | Before hard production multi-service trust                      |
| Real rails / live chain (not sandbox / NullChain)        | Before real user money                                          |
| Operator KYC / freeze / kill-switch proven in a real run | Before go-live                                                  |
| Vendor as product money                                  | **Never** without Nitro product decision (default = quarantine) |

---

## Explicit non-problems

- Services do not invent balances outside ledger recipes on production paths
- Protocol plane does not write the books
- Historical open doors (#50 / #55 / #62 / #75) still fixed
- Do **not** rebuild trade/matching/pay/p2p/bank from scratch

---

## After Denon ships again

1. Run [`WAVE-AUDIT.md`](WAVE-AUDIT.md) (delta only)
2. Update **this file** if the scoreboard changes
3. Do **not** re-run full archaeology unless law changes or main is on fire

Detail archive: [`audit/2026-07-29/`](audit/2026-07-29/) · method: [`FULL-AUDIT-PROGRAM-2026-07-29.md`](FULL-AUDIT-PROGRAM-2026-07-29.md)
