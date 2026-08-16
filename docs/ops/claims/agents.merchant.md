# Claim agents.merchant — live PayMetricsPort honesty

**Tracker:** `agents.merchant`
**Board id:** D26-P1-A4 (Denon incomplete product)
**Branch:** `feat/agents-merchant-live-metrics-port`
**Owner session:** Nitro agent
**status:** claimed
**Started:** 2026-08-16

## Done bar (this PR)

Live `merchant.runSession` requires a `PayMetricsPort`. Unset / empty / throwing port
refuses `no_live_metrics` (billedAmount `0`, no session). Live watch uses port samples
only — caller body points are not live truth. Fixture + dark paths stay as they are.

## Out of scope

- Live pay metrics allowlist / production scraper (Class X)
- pay.routing law
- copy-intel (#2099) · support-agent KB (#2067)
- Vue / apps/web / admin
