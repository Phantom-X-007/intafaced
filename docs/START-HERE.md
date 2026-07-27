# START HERE — plain map of INTAFACED (for Nitro)

**One page.** Read this when confused. Agents: load this _after_ `AGENTS.md` if the human needs orientation, not instead of the law.

**Snapshot date:** 2026-07-27 · re-check live with `pnpm tracker` + `gh pr list` — numbers go stale; the _map_ does not.

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

| Doc                                        | What it is                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `INTAFACED_DEFINITIVE_BUILD.md`            | **Engineering law** — what to build, doctrines, phases. Same file Denon shared (v2.2). |
| `INTAFACED SOVEREIGN OS.pdf`               | **Product vision** (Vol. I) — story and features; not the build checklist.             |
| `tooling/agent-protocol/AGENT_PROTOCOL.md` | **How agents change code** (hard bans).                                                |
| `CONTRIBUTING.md`                          | **How we collab** (worktrees, PRs).                                                    |
| `docs/TRACKER.md`                          | **Scoreboard** of every feature — ready / blocked / done.                              |

If two docs disagree: **law + tracker win** over memory or Telegram.

---

## Where we are (high level)

```
Phase 0 Foundations ████████░░ mostly done
Phase 1 THE CORE     ████████░░ ledger + identity + token on main
Phase 2 Trade+       ████████░░ services on main; routers NOT mounted
Phase 3+ Pay/P2P/…   ████░░░░░░ code on main; same — not a live product
```

**Snapshot date:** 2026-07-27 · main tip `7f8beec` · **0 open service PRs** (Denon #31–#39 merged).

- **On main today:** shared packages + **Phase 1–2 services** (identity, ledger, token, matching, trade, pay, p2p, bank, blueprint, agents, protocol) + apps web/admin. Tests/gates when the machine is set up.
- **Not a running product:** service **routers are not mounted** — logic and tests exist; there is no live API/product surface yet (**P0-1**).
- **Do not rebuild** matching, trade, pay, p2p, bank, blueprint, agents, protocol, web, admin, or i18n from scratch — they are on main.
- **Next product gates:** mount routers (P0-1) → purpose-keyed holds before deploy (P0-3, needs your decision) → Phase 2 feature slices via tracker.

Live floor: [`STATUS-2026-07-27.md`](STATUS-2026-07-27.md) · graph chat start: [`GRAPH-RUN-FLOOR.md`](GRAPH-RUN-FLOOR.md) · older plan (may lag): [`PHASE2-NITRO-PLAN-2026-07-27.md`](PHASE2-NITRO-PLAN-2026-07-27.md).

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

**No.** Orientation + collab audit + health check already ran (2026-07-27); service PRs are on main.  
Next useful product work is **P0-1 mount routers**, then **P0-3 holds** (your decision card), then **claim tracker-ready Phase 2 slices** — not another full-repo archaeology pass.

Re-audit only if: `main` goes red, law version changes, or tracker and reality violently disagree.

---

## Paste prompt for new AI chats

Use [`NITRO-SESSION-PROMPT.md`](NITRO-SESSION-PROMPT.md) — copy the fenced block into every new coding session.
