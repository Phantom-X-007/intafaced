# Claim ops.notifications (order terminal inbox)

**status:** LIVE this session
**tracker:** `ops.notifications` (stays **ready** — OOA still Class X credentials; digest still unwired by product law)
**branch:** `feat/notify-order-terminal-inbox`
**class:** N

Durable consumer `notify-order-updated` on existing `orderUpdated`. Inbox only for cancelled / rejected / expired. Filled stays `fillSettled`. No invented publisher. No digest wire. No gateway credentials.

## Leverage

Phase A IN: existing `svc-notify` attach + `packages/events` catalog + `@intafaced/i18n`. Horizon row `ops.notifications` = IN.

## Non-goals

- Dual-edit #1827 public-rest / exchange-contract
- Dual-edit #1828 svc-trade `/health` / features.mjs
- Wire digest into dispatch (`digest-not-wired.test.ts` stands)
- Class X email/push/sms credentials
