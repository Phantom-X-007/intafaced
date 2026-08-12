# Owner decision packet, part two — eleven outstanding rulings

**Status:** WIP — shapes being gathered. Nothing in this file is decided by an agent.

Companion to [`OWNER-DECISION-PACKET-2026-08-09.md`](OWNER-DECISION-PACKET-2026-08-09.md).

---

## D26-P0-08 · `pay:write` / KYB grant — shape ready, issuance yours

**Shape on tip:** [`adr/2026-08-12-pay-write-kyb-grant-mechanism-shape.md`](adr/2026-08-12-pay-write-kyb-grant-mechanism-shape.md) + refuse stub `assertMerchantPayScopeGrantAllowed` in `@intafaced/auth`.

**What is already decided (mechanism):** two layers — (A) scope issuance refuse-closed until you publish grant law; (B) KYB money gate separate from dossier transitions. No auto-grant on `kybStatus: approved`. Agents must not invent a grantor.

**What only you decide (A2 in the ADR):**

1. Who may invoke the grantor.
2. KYB predicate per `pay:read` / `pay:write` / `pay:refund` / `pay:payout`.
3. Sandbox temporary grant rules (if any).
4. Revocation / suspension ⇒ strip scopes.

Until those land, the merchant surface stays unreachable in production — by design, not by accident. Implementation after seal is **D26-P1-P10**.
