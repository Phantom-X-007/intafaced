# Claim TRK-trade.otc

**status:** claimed
**owner:** cursor-swarm-otc
**class:** M
**scope:** D-S-02 / SPEC-OTC-RFQ-AND-EARN Part A Stage — RFQ disclosures, no last look, refuse blank DIRECTION §8 desk law; ledger-client settle when published
**branch:** feat/trade-otc-stage
**updated:** 2026-08-07

## Non-goals

- Invent spread bps / min stake / principal choice (DIRECTION §8)
- Touch `futures/**` or `algo/**`
- Maker-routed settle recipe (refuse until owner publishes)

## Shipping

Refuse-closed default; quote/accept/settle wired on svc-trade `otc.*`; tests prove blank law refuse + bound fill + ledger posts.
