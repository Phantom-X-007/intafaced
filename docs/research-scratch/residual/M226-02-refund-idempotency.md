# Residual pack — M226-02 refund chain idempotency key

**Severity:** P1 · Class M interface  
**Status:** OPEN · agent may design; Denon review for RailAdapter surface

## Claim

`pay.refund:${ref}:${++refundSequence}` is process-local; restart can double on-chain refund if rail re-entered.

## Law

Irreversible chain send needs stable business key aligned with ledger `refundId`.

## Options (no silent invent this fire unless tiny + tested)

1. Extend `RailAdapter.refund(ref, amount, { refundId })` — **preferred**, conformance update
2. Crypto-native only convention if core can pass id without interface break

## DoD

- Chain key includes durable refundId
- Partial refunds still unique
- Tests: restart sim / two partials / retry after crash
- Critic ACCEPT

## Not this fire if

Requires multi-service contract PR without capacity — leave OPEN with this pack.
