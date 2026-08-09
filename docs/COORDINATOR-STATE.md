# Coordinator live state (v1.1)

**Lead only — re-derive tip before any `new` / `topup` / `status`.**  
**Cold start:** this file → [`COORDINATOR-WAVE-RUNBOOK.md`](COORDINATOR-WAVE-RUNBOOK.md) → [`PROMPT-COORDINATOR-DOCTRINE.md`](PROMPT-COORDINATOR-DOCTRINE.md) → [`COORDINATOR-PASTE-SKELETON.md`](COORDINATOR-PASTE-SKELETON.md) → `git fetch` + open PRs.

---

## Snapshot

| Field               | Value                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **last_updated**    | 2026-08-09 (Denon hard-parallel board + wave 6)                                                                                                                                                   |
| **os_version**      | 1.1 (+ runbook §5.1 depth gate)                                                                                                                                                                   |
| **active_wave**     | **6**                                                                                                                                                                                             |
| **denon_parallel**  | **LIVE** — [`DENON-HARD-PARALLEL-BOARD-2026-08-09.md`](DENON-HARD-PARALLEL-BOARD-2026-08-09.md) · LIVE-LANES `denon-hard-parallel` · agents: residual only · he: invent-risk engines + P0 rulings |
| **tip_at_last_new** | `8da2c561` paste-time · live re-fetch (was `a688e231` at depth audit)                                                                                                                             |
| **lane_count**      | 16                                                                                                                                                                                                |
| **paste_dir**       | `docs/paste-w6/`                                                                                                                                                                                  |
| **master_paste**    | `docs/PASTE-BUILD-WAVE-6-2026-08-09.md`                                                                                                                                                           |
| **depth_audit**     | `docs/PASTE-W6-DEPTH-AUDIT-2026-08-09.md` — **PASS** after thicken                                                                                                                                |
| **clipboard_index** | L16 (all clipboard re-push)                                                                                                                                                                       |
| **wave_6_status**   | Cooking · pastes depth-thickened (esp L08/L13; all Done bars filled)                                                                                                                              |
| **prior_wave**      | 5 — many SAFE TO CLOSE; market/identity/shell/L15 still had open blockers mid-wave                                                                                                                |
| **n_policy**        | evidence-driven; 16 residual + open PR babysit · depth gate on every `new`                                                                                                                        |

---

## Triggers

| Say             | Action                 |
| --------------- | ---------------------- |
| `new`           | Full NEW pipeline      |
| `force new`     | NEW + live-wall absorb |
| `topup`         | Free seats only        |
| `next`          | Clipboard next         |
| `all clipboard` | Sequential pbcopy all  |
| `status`        | Peace packet           |
| `audit pastes`  | Quality re-score       |

---

## nitro_only_open

| Domain         | Open decisions                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Pay**        | pay:* grants · fee tables · chargeback · acquirer Class X · crypto subs vs protocol · routing costs/approval rates |
| **Trade**      | leader_share_bps · OTC spreads · leverage · venue keys Class X · options D7 · fundable forex                       |
| **Bank**       | earn day-boundary law · fiat partner Class X · card issuer · invest rates §8                                       |
| **Market**     | commission bps · ranking DIRECTION 8 · subscription past-due law                                                   |
| **Notify/Ops** | gateway credentials Class X · sanctions/geo · admin SSO · affiliate §8                                             |
| **Agents**     | live data allowlists · model credentials Class X · agent pricing §8 · metering-off product ruling                  |
| **Academy**    | residency economics · prize amounts · IFC rates §8                                                                 |
| **P2P**        | p2p:moderate who · partners Class X                                                                                |
| **Token**      | emission curve §8                                                                                                  |
| **Ledger**     | treasury freeze policy Class X                                                                                     |
| **Global**     | prod go-live · secrets · counsel                                                                                   |

---

## Wave 6 lane map

| ID      | Title                     | File                            |
| ------- | ------------------------- | ------------------------------- |
| L01–L16 | residual same walls as W5 | `docs/paste-w6/L01.md`…`L16.md` |

---

## Collision risks (wave 6)

- ~60–75 open PRs — path-intersect every unit
- Babysit open stop PRs (PAY/TRADE/INDEXER/WS/LEDGER/P2P)
- Market commerce still Class M risk historically
- Identity/shell blocked on monorepo Tests — **fix only your suites**
- L11/L16 vendor split · features.mjs mountain-event · Shehzad #1177
- **Denon hard-parallel:** do **not** open agent product-complete on trade/pay/bank invent-risk engines he is taking; residual patches only; path-intersect his new PRs when they appear · he starts SAFE START (rulings/docs) so residual can finish hot services first

---

## Next action

Paste wave 6 → cook · mid free seats → `topup` · all done → `new`
