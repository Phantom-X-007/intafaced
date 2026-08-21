# Claim agents.support

**status:** claimed
**owner:** nitro-agent
**branch:** feat/agents-support-live-kb
**tracker:** agents.support
**scope:** `services/svc-agents/src/support-agent/**` plus router/index mount for the live desk port
**done bar:** Live `ops.support` KB plane — `SUPPORT_URL` set reads the real desk; unset refuses `no_live_kb` (billedAmount 0). Empty port KB is `kb_empty`. Fixtures stay test-only.
**leverage:** Existing support-agent data-tools + svc-support `searchKb`/`getKb`/ticket `get` + identity `/internal/account/:userId` (same projection svc-support already uses). No second SPA, no second book.
**do not touch:** merchant, svc-support, navigator, scanner, LIVE-LANES, compose restamps
