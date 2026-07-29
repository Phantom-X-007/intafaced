# Peace of mind — current floor (Nitro)

**Date:** 2026-07-29  
**Main tip:** re-check `git rev-parse origin/main` (this file updates with residual hygiene; tip moves)  
**Claim tags:** `[VERIFIED 2026-07-29]` audit program closed; #86 custody + shell on main; residual wallet mass-credit + CORS `*` closed on this PR

**Stream A claim:** GitHub issue [#83](https://github.com/Phantom-X-007/intafaced/issues/83) · [`NITRO-STREAM-A-CLAIM.md`](NITRO-STREAM-A-CLAIM.md)

**Orient:** [`START-HERE.md`](START-HERE.md) · **Residual after #86:** [`POST-MERGE-RESIDUAL-AFTER-86.md`](POST-MERGE-RESIDUAL-AFTER-86.md) · **Security tooling floor:** [`SECURITY-FLOOR-AFTER-AUDIT-2026-07-29.md`](SECURITY-FLOOR-AFTER-AUDIT-2026-07-29.md) · plain when-to: [`SECURITY-WHEN-PLAIN.md`](SECURITY-WHEN-PLAIN.md)

Older July-27 peace/status docs are **history** — this file is the trust floor.

---

## Verdict (one breath)

**Denon can keep building.** Platform is real (edge, mounts, money path, deploy, terminal, **vendored exchange shell** as product UI). Audit doors closed on main (#80, #81); three more custody doors closed with #86; **shell wallet mass-credit + CORS wildcard closed** in residual hygiene. Remaining risk is **named**, not mystery.

After each Denon wave: [`WAVE-AUDIT.md`](WAVE-AUDIT.md) only — not a full re-audit.  
**Do not go live with real user money** until dual-book discipline holds, production CORS origins are set, rails/chain are real, kill drill is proven, and Priority-1 licences are settled.

---

## Scoreboard

| System                   | Risk now                                             | Status                               |
| ------------------------ | ---------------------------------------------------- | ------------------------------------ |
| Ledger                   | Low if perimeter holds                               | OK to build                          |
| Identity                 | Open XP mint fixed; API-key escalate closed (#86)    | OK                                   |
| Pay                      | IDOR + withdraw crash fixed; retry contract residual | OK to build · residual               |
| Token / bank earn        | Claim-order + purpose pots fixed; scopes issued      | OK                                   |
| P2P                      | Purpose escrow + party-only reads fixed              | OK                                   |
| Edge                     | Region bound into principal HMAC                     | OK for dev                           |
| Protocol / DEX / indexer | Mounted shells; chain propped                        | Not product-complete                 |
| Deploy                   | One-command platform; S2S not host-published         | Usable with care                     |
| **Vendor (shell)**       | **Product UI** OK; **high if used as books**         | **UI shell · quarantined as ledger** |
| CI doctrine              | Brand/custody + vendor-shell residue scan            | OK                                   |

---

## Closed on main (do not re-open)

**#80 · #81 (audit program)**

- Protocol `/trpc` mount · awardXp service-only · pay ownership · internal HMAC
- Withdraw reverse durability · stake/earn pending→active
- Purpose-keyed escrow + stake pots · region HMAC · P2P read IDOR
- S2S ports not on host · RUNNING/protocol UI honesty · tracker done evidence

**#86 (custody + shell)**

- API-key privilege escalation (scope ceiling on grant)
- Wallet RPC unauthenticated withdraw (shared-secret, fail-closed)
- Live trading backdoor / mock controllers removed
- Shell rebrand (English-only, black/orange; vendor logos out)
- Bank + blueprint scopes issued to sessions
- Licence inventory named · `workspace-sync` widened

**Residual hygiene (this wave)**

- `unfreezeMore` / `unfreezeLess` mass balance credit disabled (service throw + DAO no-op)
- `dropWeekTable` TRUNCATE / `createWeekTable` snapshot helpers disabled
- CORS `*` + credentials replaced with explicit allowlist (`CORS_ALLOWED_ORIGINS`)
- `pnpm scan:vendor-shell` CI gate so these cannot silently return

**PR proof:** [#80](https://github.com/Phantom-X-007/intafaced/pull/80) · [#81](https://github.com/Phantom-X-007/intafaced/pull/81) · [#86](https://github.com/Phantom-X-007/intafaced/pull/86)

---

## Still open (short list)

Full residual + owners: [`POST-MERGE-RESIDUAL-AFTER-86.md`](POST-MERGE-RESIDUAL-AFTER-86.md)

| Item                                                                            | When it matters                       |
| ------------------------------------------------------------------------------- | ------------------------------------- |
| **Dual-book** — vendored exchange shell ≠ money books (TS ledger remains books) | **Now** · hard before real money      |
| Production **CORS origins** env (`CORS_ALLOWED_ORIGINS`) for real domains       | Before public shell                   |
| **L2-6** S2S body-bind (raw-body design)                                        | Before hard multi-service prod        |
| Real **rails / live chain**                                                     | Before real user money                |
| Operator freeze / **kill drill** proven end-to-end                              | Before go-live                        |
| **Licences** Priority-1 (chart path · MySQL connector)                          | Before public product — Denon decides |
| **Pay withdraw retry** — test vs service contract                               | Soon · before real money              |
| Wallet secrets / host perimeter                                                 | Denon ops · before real money         |

---

## Explicit non-problems

- Services do not invent balances outside ledger recipes on production paths
- Protocol plane does not write the books
- Historical open doors (#50 / #55 / #62 / #75) still fixed
- Do **not** rebuild trade/matching/pay/p2p/bank from scratch
- Product UI is the **vendored exchange shell** at localhost:8090 — not `apps/web`
- Shell is **never** the money books without Nitro product decision (default = quarantine as ledger)
- Do **not** merge multi-asset instruments without Denon
- Do **not** re-run full archaeology for residual hygiene

---

## After Denon ships again

1. Run [`WAVE-AUDIT.md`](WAVE-AUDIT.md) (delta only)
2. Update **this file** if the scoreboard changes
3. Trim residual in [`POST-MERGE-RESIDUAL-AFTER-86.md`](POST-MERGE-RESIDUAL-AFTER-86.md) when items close
4. Do **not** re-run full archaeology unless law changes or main is on fire

**Entry:** [`START-HERE.md`](START-HERE.md) · Detail archive: [`audit/2026-07-29/`](audit/2026-07-29/) · Method: [`FULL-AUDIT-PROGRAM-2026-07-29.md`](FULL-AUDIT-PROGRAM-2026-07-29.md)
