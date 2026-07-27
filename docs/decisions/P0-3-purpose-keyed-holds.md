# Decision: P0-3 purpose-keyed holds

**For Nitro.** One page. Check a box when you decide.

**Status:** Awaiting your decision · **Not a live production bug today** (nothing is mounted / deployed).

---

## What the bug is (one breath)

When money is “held” for a user, the books put **order reservations** and **withdrawal holds** in the **same bucket** (`userHold` per user + asset). The system cannot tell which hold belongs to which order or withdrawal. In theory a withdrawal could eat funds that were reserved for an open order (or the reverse).

Trade already tracks per-order hold amounts inside its own store and tests that those sum to the ledger hold balance — so **inside trade** it’s careful. The hole is **across modules** (e.g. withdrawal settle vs open orders).

---

## Why it is not fixed yet

1. The fix changes the **ledger account model** (how accounts are named and indexed) — not a one-line patch.
2. **Many services** build against that model (~8+). A rushed change while services were still landing would make a real bug into a worse one.
3. **Nothing is live** — routers are not mounted (P0-1). There is no production user path exercising this today. That is intentional room to do it properly.

---

## Denon’s proposal (~1 day once started)

- Add a **`purpose`** field on the account reference (`AccountRef`): e.g. `order:<id>`, `withdraw:<id>`, or empty/null for ordinary balances.
- One **database migration** (unique index on accounts includes purpose).
- Update **ledger-client** recipes so `tradeFill` / `orderHoldRelease` take the **order id** and post against the right purpose-keyed hold.
- Touch **svc-trade** and **svc-ledger** (and any path that opens/settles holds).

Rough effort: about a day of focused work after design is locked.

---

## What you are deciding

| Option                           | Meaning                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Approve Denon’s proposal** | Build purpose-keyed holds as described. Timing: after P0-1 mount design is known, **before any deployment**.                                            |
| **B — Change the proposal**      | You want a different shape (e.g. separate account kinds instead of `purpose`). Say what you want in chat; engineering revises.                          |
| **C — Keep deferring**           | Leave as-is until after routers are mounted and you’ve seen a running surface. Accept that deploy is still blocked until this (or an equivalent) lands. |

---

## Recommendation

**Approve A.** Sequence:

1. Design / do **P0-1 mount routers** first (product still not live until then).
2. Build **P0-3** as soon as mount design is clear enough that hold APIs won’t thrash — **before any real deploy**.
3. Do not ship users onto a surface that can withdraw against order holds.

Risk if you skip forever: first real money paths can cross-consume holds. Risk if you build too early with no mount design: extra rework on APIs that don’t exist yet. The recommendation splits that difference.

---

## Your decision (check one)

- [ ] **A** — Approve Denon’s proposal; build after P0-1 design is known, before deploy
- [ ] **B** — Change the proposal (comment below or in chat)
- [ ] **C** — Keep deferring until after mount; no hold work yet

**Date decided:** _______________  
**Notes:**

```
(optional)
```

---

## Links

- Floor status: [`docs/STATUS-2026-07-27.md`](../STATUS-2026-07-27.md)
- Fill SoT (related, already accepted): [`docs/adr/2026-07-27-trade-order-store-source-of-truth.md`](../adr/2026-07-27-trade-order-store-source-of-truth.md)
