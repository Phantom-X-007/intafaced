# START HERE — plain map of INTAFACED (for Nitro)

**One page.** Read this when confused. Agents: load this _after_ `AGENTS.md` if the human needs orientation, not instead of the law.

**Snapshot date:** 2026-07-29 evening · trust floor = mega-wave after #86 (re-check `git rev-parse origin/main` + [`PEACE-OF-MIND-AUDIT-CURRENT.md`](PEACE-OF-MIND-AUDIT-CURRENT.md)).

---

## What we are building (one breath)

**INTAFACED** is a full financial operating system: trade (broker), later bank/pay/P2P, and a non-custodial “Protocol” side.  
**One identity. One ledger (the books). One token (IFC).** Partners plug in as adapters — they never _are_ the product.

Two **planes** (lanes of risk):

| Word               | Plain meaning                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Fiat Plane**     | We hold value for users (custodial). Must be compliant where required. Trade/bank/pay live here. |
| **Protocol Plane** | User holds their own keys (non-custodial). Platform never can withdraw for them.                 |
| **Identity**       | One account, rank, KYC tier — shared by every module                                             |
| **Ledger**         | The only place balances live. Everything that moves money talks to it.                           |
| **IFC**            | The platform token (stake, fees discount, later governance)                                      |

---

## The “law” vs the “pitch”

| Doc                                            | What it is                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `INTAFACED_DEFINITIVE_BUILD.md`                | **Engineering law** — what to build, doctrines, phases. Same file Denon shared (v2.2).          |
| `INTAFACED SOVEREIGN OS.pdf`                   | **Product vision** (Vol. I) — story and features; not the build checklist.                      |
| `tooling/agent-protocol/AGENT_PROTOCOL.md`     | **How agents change code** (hard bans).                                                         |
| `CONTRIBUTING.md`                              | **How we collab** (worktrees, PRs).                                                             |
| `docs/TRACKER.md`                              | **Product feature map** — ready / blocked / done / owner (not campaign micro-next).             |
| `docs/COORDINATION-TRUTH-LAYERS.md`            | **Which file answers which question** (tracker vs Board Clear vs LIVE-LANES). **Finished law.** |
| `docs/COORDINATION-FINISH-AUDIT-2026-08-02.md` | How to re-audit F1–F10; what “done” means for this program.                                     |

If two docs disagree on **product ownership / free work:** **law + tracker** win over memory, Telegram, or campaign boards. Campaign **NEXT** only wins for “what to ship next in Board Clear,” never to erase human locks.

---

## Where we are (high level)

```
Phase 0 Foundations ████████░░ mostly done
Phase 1 THE CORE     ████████░░ ledger + identity + token on main
Phase 2 Trade+       ████████░░ mounted behind edge; terminal wired
Phase 3+ Pay/P2P/…   ██████░░░░ mounted; rails/sandbox still not live product
```

**Snapshot date:** 2026-07-29 · main tip includes audit **#80 + #81** (`88e5e33`).

- **On main:** full fleet + apps. Routers mounted. Purpose-keyed holds **and** purpose-keyed escrow/stake. `pnpm platform:up` exists.
- **Not a live money product:** rails/sandbox, chain feed propped — see trust floor.
- **Do not rebuild** services already on main.
- **Trust floor (open first):** [`PEACE-OF-MIND-AUDIT-CURRENT.md`](PEACE-OF-MIND-AUDIT-CURRENT.md) · what “proper cleanup” means: [`PROPER-CLEANUP-AFTER-DENON.md`](PROPER-CLEANUP-AFTER-DENON.md)
- **Product UI:** vendored exchange shell → http://localhost:8090 (`vendor/<exchange-tree>/05_Web_Front`). `apps/web` is **not** the product.
- **Residual after #86:** [`POST-MERGE-RESIDUAL-AFTER-86.md`](POST-MERGE-RESIDUAL-AFTER-86.md)
- **Security when-to:** [`SECURITY-WHEN-PLAIN.md`](SECURITY-WHEN-PLAIN.md) · tooling floor: [`SECURITY-FLOOR-AFTER-AUDIT-2026-07-29.md`](SECURITY-FLOOR-AFTER-AUDIT-2026-07-29.md)
- **After a big ship wave:** [`MEGA-AUDIT-PASTE-2026-07-29.md`](MEGA-AUDIT-PASTE-2026-07-29.md) or [`WAVE-AUDIT.md`](WAVE-AUDIT.md) — full A–E is **closed**
- **Latest wave archive:** [`audit/2026-07-29-wave/`](audit/2026-07-29-wave/)
- **Next product gates:** dual-book discipline + real rails/chain → not another full audit
- **Denon handover (2026-07-29):** [`HANDOVER-NITRO-BRANCHES.md`](HANDOVER-NITRO-BRANCHES.md) · owner decisions closed: [`OWNER-DECISIONS-OPEN.md`](OWNER-DECISIONS-OPEN.md)
- - **Denon return board (2026-07-29):** [`DENON-RETURN-GITHUB-STATE-2026-07-29.md`](DENON-RETURN-GITHUB-STATE-2026-07-29.md) — what Nitro agents landed; do not rebuild
- **Nitro’s product lane (Stream A):** trader shell — claim + checklist in [`NITRO-STREAM-A-CLAIM.md`](NITRO-STREAM-A-CLAIM.md) · issue **#83**. Frontend lock: [`FRONTEND-STATE-OF-TRUTH-2026-07-31.md`](FRONTEND-STATE-OF-TRUTH-2026-07-31.md) when present on tip.
- **BOARD CLEAR CAMPAIGN (active):** after compact open **[`BOARD-CLEAR-NEXT.md`](BOARD-CLEAR-NEXT.md) first** for _campaign sequence_ · parallel [`BOARD-CLEAR-PARALLEL-SESSIONS.md`](BOARD-CLEAR-PARALLEL-SESSIONS.md) · AFK [`BOARD-CLEAR-AFK-CONTRACT.md`](BOARD-CLEAR-AFK-CONTRACT.md) · GO [`BOARD-CLEAR-AUTONOMOUS-RUN.md`](BOARD-CLEAR-AUTONOMOUS-RUN.md). **NEXT is not the product ownership map** — free/human-owned still = tracker + LIVE-LANES ([`COORDINATION-TRUTH-LAYERS.md`](COORDINATION-TRUTH-LAYERS.md)).
- **Shehzad hard ownership (human spine — collision wall):** one-screen [`GITHUB-OWNERSHIP-SHEHZAD.md`](GITHUB-OWNERSHIP-SHEHZAD.md) · detail [`SHEHZAD-HARD-OWNERSHIP-2026-08-01.md`](SHEHZAD-HARD-OWNERSHIP-2026-08-01.md) · lanes [`LIVE-LANES.md`](LIVE-LANES.md) · GitHub **`@shehzad002`** M1–M7 · tracker owner + CODEOWNERS. Agents never implement his paths; keep shell + trade-light + WS + academy.
- **Residual campaign (older partial-first mode):** [`NITRO-RESIDUAL-CAMPAIGN-2026-07-31.md`](NITRO-RESIDUAL-CAMPAIGN-2026-07-31.md) · lanes [`LIVE-LANES.md`](LIVE-LANES.md) — use only if Board Clear docs missing.
- **Order-route:** #289 merged under Board Clear A-OR-1; residual Java dual-book = shehzad M7.
- **Who owns what (durable — not a status board):** [`NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md`](NITRO-OWNERSHIP-AND-DENON-DIRECTION-2026-07-31.md) · also in [`AGENTS.md`](../AGENTS.md) · paste [`NITRO-SESSION-PROMPT.md`](NITRO-SESSION-PROMPT.md). **Denon = direction; Nitro agents = ship + merge when gates pass.** Live tip/PRs: re-derive with git/`gh`, never from memory.
- **GitHub CI money (Actions thrift — active law):** [`GITHUB-CI-SPEND-CONTROL-2026-07-31.md`](GITHUB-CI-SPEND-CONTROL-2026-07-31.md) · also in `AGENTS.md`. Parallel/autonomous shipping stays; cut waste + cheaper runners. Not a Denon review gate.
- **#86 landed on main** (shell rebrand + custody locks). **Board Clear** authorizes trade-mountain Done bars (thin/§13, never invent prices) without waiting on new Denon chat — see constitution + ownership precedence.

History only (may lag): [`STATUS-2026-07-27.md`](STATUS-2026-07-27.md)

---

## Words you will keep hearing

| Term                  | Plain language                                                               |
| --------------------- | ---------------------------------------------------------------------------- |
| **main**              | Official branch. Always supposed to be safe to run.                          |
| **branch**            | Side copy for one piece of work.                                             |
| **PR (pull request)** | “Please put my branch into main.” Review + CI live here.                     |
| **merge**             | Accept the PR into main (we **squash** = one clean commit).                  |
| **worktree**          | Second folder of the same repo on another branch so two agents never fight.  |
| **CI**                | Robots that run tests on every PR.                                           |
| **tracker**           | Feature list with dependencies; `pnpm tracker ready` = free to start.        |
| **claim**             | “I’m doing this” — set owner/wip + Telegram so nobody doubles.               |
| **money path**        | Any code that moves value → stricter tests, ledger recipes only.             |
| **recipe**            | Approved way to post to the ledger (e.g. trade fill). Never invent balances. |
| **DoD / gate**        | Definition of Done checks — brand, custody, migrations, service checklist.   |
| **socket**            | Deliberately _not_ built in v1, but interface reserved.                      |

---

## The right way (non-negotiable for every chat)

1. **Never edit in the main folder** — worktree + feature branch.
2. **Never push straight to main** — PR only.
3. **Green `pnpm verify` before “done.”**
4. **One service / one concern per PR.**
5. **Money only via ledger recipes; no float balances; no partner names in UI.**
6. **Don’t rebuild services already on main** (or reopen merged Denon work).
7. Agents run git/PR for Nitro (**operator mode** in [`AGENTS.md`](../AGENTS.md)).

Collab deep dive: [`COLLAB-AUDIT-2026-07-27.md`](COLLAB-AUDIT-2026-07-27.md) · Denon paste: [`MESSAGE-DENON-WORKFLOW.md`](MESSAGE-DENON-WORKFLOW.md)

---

## Do you need a “big audit” before coding?

**Full A–E program:** done 2026-07-29 — see [`PEACE-OF-MIND-AUDIT-CURRENT.md`](PEACE-OF-MIND-AUDIT-CURRENT.md).  
**After a Denon merge wave:** run [`WAVE-AUDIT.md`](WAVE-AUDIT.md) (delta), not full archaeology.

Re-run full program only if: main doctrine/money tests go red, law version changes, or peace-of-mind and reality violently disagree.

---

## Paste prompt for new AI chats

Use [`NITRO-SESSION-PROMPT.md`](NITRO-SESSION-PROMPT.md) — copy the fenced block into every new coding session.
