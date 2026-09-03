# ADR: Protocol rails until INTACHAIN — house book + Base; P1 parked

**Status:** **Accepted — 2026-09-03.** Nitro human decision.  
**Decision owner:** Nitro.  
**Does not replace:** `INTAFACED_DEFINITIVE_BUILD.md` §16–§17 (end-state still own L1).  
**Supersedes for _timing_ only:** `docs/LAST-MVP-BOARDS-2026-08-23.md` §4 “INTACHAIN GO / start P1 now” and the 2026-08-23 GO delta on the Shehzad board.  
**Companion:** P0 rails [`2026-08-08-protocol-plane-p0-handshake-and-rails.md`](2026-08-08-protocol-plane-p0-handshake-and-rails.md) (Base Sepolia → Base; anvil = CI). Matching dual-target [`2026-08-04-matching-dual-target.md`](2026-08-04-matching-dual-target.md).

---

## Decision

Until Nitro says **GO** again on P1:

1. **Fiat exchange** stays the **house book** (`svc-matching` → ledger post is final). Do not move matching onto Base, HyperEVM, HIP-3, or a new L1/L2/L3.
2. **Protocol Plane P0** stays **contracts on Base** (CI: anvil). Honest labels: not INTACHAIN, `audited: false` until a paid firm.
3. **INTACHAIN P1 implement is parked.** No `svc-chain`, no genesis, no Cosmos/CometBFT binary, no `chain.mainnet` Done. End-state in §17 is **not** cut — only this wave’s start.
4. **Banned until a new Nitro GO:** HIP-3 (rent Hyperliquid), HyperEVM as the protocol home, Base Appchain / extra L3, a second L2 “just in case,” calling any Base deploy “our chain.”

Unpark: Nitro writes **GO** on this ADR (or a successor) **and** an S-D2 module map exists **and** any testnet is labelled **not mainnet**.

---

## Why (one line each)

- House book already is the CEX. Hyperliquid-class L1 is a later product yes, not a size trigger.
- 2026: no kit copies HyperCore; P0 on Base was already ruled; rivals that grew did not win by shipping a fake L1.
- 23 Aug GO is overruled so partners and agents stop treating P1 as this week’s work.

---

## Who does what now

| Who              | Does                                                                                       | Does not                                    |
| ---------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------- |
| **Shehzad**      | Protocol P0 on Base/anvil: deploy honesty, #2473 residual, venue contract `audited: false` | `svc-chain`, S-D4, INTACHAIN mainnet stamps |
| **Nitro agents** | Shell, house matching/trade/bank/pay                                                       | Dual-build chain; second CLOB               |
| **Nitro human**  | Future P1 GO · audit budget · RPC/gas float · venues · HIP-3 if ever (Class X)             | —                                           |

---

## Named leftovers this parks (not deleted)

`chain.mainnet` · `chain.evm` · `bridge.canonical` (canonical _INTACHAIN_ bridge) · `chain.validators` · `chain.governance` · `predict.markets` as INTACORE type · `chain.rust-core`. Ledger↔Base IFC, if ever, is a **separate** bounded-window posting (`2026-08-04-cross-plane-bridge-accounting.md`) — not a substitute P1.

---

## Conflict rule

If a dated board or tracker “ready” line says start INTACHAIN P1 **now**, **this ADR wins** until Nitro GOs. Doctrine §17 still wins on _what P1 is_ when it starts.
