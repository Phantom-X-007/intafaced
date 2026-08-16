# Claim agents.portfolio

**status:** claimed
**owner:** nitro-agent
**slice:** plan-only (no placeOrder)
**branch:** feat/agents-portfolio-plan
**updated:** 2026-08-16

v2 Portfolio Agent plan slice: compare holdings vs owner-supplied targets.
Injected `PortfolioPort` (ops.portfolio view in-flight elsewhere). Unset port →
named dark refuse. Cross-plane legs refuse. Kill-switch default off. Every
attempt appends `agent_actions`-shaped audit. Class M the moment it places —
this PR does not place.
