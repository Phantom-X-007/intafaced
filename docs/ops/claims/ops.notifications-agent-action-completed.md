# Claim ops.notifications (agent action completed inbox)

**status:** LIVE this session
**tracker:** `ops.notifications` (stays **ready** — OOA still Class X credentials; digest still unwired by product law)
**branch:** `feat/notify-agent-action-completed`
**class:** N

Durable consumer `notify-agent-action-completed` on existing `agentActionCompleted` (svc-agents publisher). Inbox only when `kind` is `completion` or `session_close`. Omitted kinds (`tool_call`, `embedding`, `session_open`, `usage_settlement`) ack and do not write. Closes the Class A missing-subscriber socket because a live consumer now exists. No invented publisher. No digest wire. Jobs/credentials unchanged.

## Leverage

Phase A IN: existing `subscribeNotificationEvents` + `NOTIFY_EVENT_CONSUMERS` + `agentActionRejected` pattern in svc-notify. Horizon row `ops.notifications` = IN.

## Non-goals

- Dual-edit #1836 svc-trade `index.ts`
- Wire digest into dispatch
- Class X email/push/sms credentials
- Notify on every `tool_call` / `embedding`
