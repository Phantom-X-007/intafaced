# START HERE — plain map of INTAFACED (for Nitro)

**One page.** Read this when confused. Agents: load this _after_ `AGENTS.md` if the human needs orientation, not instead of the law.

**Snapshot date:** 2026-07-29 · re-check live with `pnpm tracker` + `gh pr list` — numbers go stale; the _map_ does not.

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
Phase 2 Trade+       ████████░░ mounted behind edge; terminal wired
Phase 3+ Pay/P2P/…   ██████░░░░ mounted; rails/sandbox still not live product
```

**Snapshot date:** 2026-07-29 · re-check live with `git log origin/main -1` + `gh pr list` — numbers go stale.

- **On main:** full fleet (15 services including edge, dex, indexer, ws) + apps web/admin + packages. **Routers are mounted** behind `svc-edge`. Purpose-keyed holds shipped. `pnpm platform:up` exists.
- **Not a live money product:** rails/sandbox, chain indexer propped (`NullChainSource`), remaining money crash-window fixes on the residual queue.
- **Do not rebuild** services already on main.
- **Trust floor:** [`PEACE-OF-MIND-AUDIT-CURRENT.md`](PEACE-OF-MIND-AUDIT-CURRENT.md) · after Denon waves: [`WAVE-AUDIT.md`](WAVE-AUDIT.md).
- **Wave-1 audit PR:** [#80](https://github.com/Phantom-X-007/intafaced/pull/80) (open doors fixed; residual money still queued).
- **Next audit chat:** paste [`HANDOVER-AUDIT-V2-PASTE.md`](HANDOVER-AUDIT-V2-PASTE.md) · program [`AUDIT-V2-RESIDUAL-AND-STRESS-2026-07-29.md`](AUDIT-V2-RESIDUAL-AND-STRESS-2026-07-29.md).
- **Next product gates:** residual P1 money crash windows → real rails/chain → tracker-ready slices.

Older snapshot (may lag): [`STATUS-2026-07-27.md`](STATUS-2026-07-27.md).

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
