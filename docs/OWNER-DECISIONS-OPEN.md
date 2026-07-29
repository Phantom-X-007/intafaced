# Owner decisions open — after Denon handover (2026-07-29)

Engineering cannot close these. Mechanism is ready; content/choice is yours (or counsel).

## 1. TradingView Charting Library (licence + security)

**Facts:** 85 vendored files, no licence/NOTICE/EULA. Spec already names **lightweight-charts** (Apache-2.0) in `docs/TERMINAL.md`. Full audit: `docs/LICENCE-POSITION.md` §1.1.

| Path | What it means | Effort |
| --- | --- | --- |
| **A — Hold TERMINAL.md (recommended default)** | Drop Charting Library path; build charts on lightweight-charts | Product + app work; lawful |
| **B — Keep Advanced Charts** | Apply to TradingView as named licensee | Days+ commercial; gates launch |
| **Eng already (no decision):** cut remote OSS chart loads (third-party Alibaba Cloud bucket) — that was arbitrary remote JS in users' browsers | security floor | separate PR |

**You decide A or B.** Until then do not ship the shell publicly with the vendored library.

## 2. Sanctions blocklist (counsel)

**Facts:** After #101, staging/prod **refuse to boot** with an empty list. Env shape:

```
INTAFACED_SANCTIONS_REGIONS="AA:reason,BB:reason"
INTAFACED_SANCTIONS_LIST_SOURCE="counsel-memo-YYYY-MM-DD"
```

Test fixtures use unassigned ISO codes (`AA`, `ZY`, `QQ`) so placeholders cannot be mistaken for a real list. There is **no** "empty is fine" flag.

**You (via counsel):** which ISO-3166 regions + reason text + provenance. Engineers only paste into deploy config.

## 3. `mysql-connector-java:8.0.11` (GPL)

**Facts:** GPL v2 with FOSS exception a proprietary product is not on. MariaDB Connector/J is the one-line swap in vendor POMs. See `docs/LICENCE-POSITION.md`.

**You decide:** approve the MariaDB swap (engineering can land it next) or accept GPL risk with counsel.

## 4. CORS origins for Java modules

**Facts:** Java services need explicit allowed origins for the product host(s). Not a default to invent.

**You decide:** exact production/staging origins list.

---

## Not owner — do not merge

WIP branches from crash recovery (see `docs/HANDOVER-NITRO-BRANCHES.md`). Especially **`feat/spine-java-rename`**: renames package root; **1,420 MongoDB docs** use `_class` discriminators; without migration in the same change, chart history orphans. Vendor names are live MySQL schema + Mongo DB names.

## Verified money already on the merge path

| PR / branch | Status |
| --- | --- |
| #101 release verified (history, dex quotes, screening) | merge first |
| #102 `feat/spine-trading-hours` (incl. multi-asset ancestor) | money — owner merges after green CI |
