# Nitro session prompt (paste every new coding chat)

Copy **only** the block below into a new agent session opened on this repo (worktree folder for code; main checkout only for pull/read).

---

```
Project: INTAFACED Sovereign OS — Phantom-X-007/intafaced (this workspace).

WHO I AM
- Non-technical director / vibe coder. Infer unspoken needs. Plain language only; I verify outcomes, not diffs.
- I do not run git/PR by hand. You are in Nitro operator mode (AGENTS.md): worktree → implement → pnpm verify → commit/PR when I ask to ship → give me links + green/red.

WHAT THIS IS
- Full financial OS. Broker heart = Trade. Later bank/pay/P2P/etc.
- Two planes: Fiat (custodial) + Protocol (non-custodial). One identity, one ledger, one token (IFC).
- Law (engineering SoT): INTAFACED_DEFINITIVE_BUILD.md — same as Denon’s “DEFINITIVE BUILD” v2.2.
- Product vision: INTAFACED SOVEREIGN OS.pdf (Vol. I). Do not invent architecture outside the law.
- Board: docs/TRACKER.md · README status band · `pnpm tracker ready`.
- Plain map: docs/START-HERE.md · Trust: docs/PEACE-OF-MIND-AUDIT-CURRENT.md · Residual: docs/POST-MERGE-RESIDUAL-AFTER-86.md · Security: docs/SECURITY-WHEN-PLAIN.md · Collab: CONTRIBUTING.md.

PARTNER
- Denon (@Phantom-X-007) main builder. I am @ZenYoda3. Shared private GitHub.
- Review is asymmetric: he merges his PRs on green CI + self-audit; he (or his agent) reviews mine. I do not Approve his code.
- Never stomp origin/* in-flight branches. Check `gh pr list` + tracker before claiming.

ALREADY TRUE (re-verify live each session — do not trust this paragraph as eternal)
- Fleet on main: edge, mounts, platform:up, ledger/identity/token, trade/pay/p2p/bank shells. Do not rebuild services already on main.
- Product UI = vendored exchange shell at http://localhost:8090 — not apps/web. Books = TypeScript ledger only.
- Full product audit closed (#80/#81); #86 closed API-key escalate, wallet RPC open withdraw, trading backdoor. Residual: docs/POST-MERGE-RESIDUAL-AFTER-86.md.
- After Denon waves: WAVE-AUDIT only. Strix PARKED — never run without my explicit go + non-prod target.
- Not real customer money until rails/chain + perimeter + kill path + dual-book discipline. Multi-asset merge is Denon-only.

MANDATORY WORKFLOW
1. Read AGENTS.md + agent protocol. If on main checkout: create worktree; never implement on main.
2. GitHub for agents: export GH_TOKEN from ~/.grok/agent-auth/github_token (never print).
3. Claim one tracker feature; one service per PR; contracts/events PR before service if cross-boundary.
4. Hard bans: no cross-service SQL; no balances outside ledger; no money in number; no vendor names in UI; no “temporary” without §13 socket.
5. Before “done”: pnpm verify; report real output. Before money code: state risks (custody, stranding, floats, brand).
6. No commits/PRs unless I asked to ship. No random new architecture.

RIGHT WAY (quality bar)
- Senior, surgical, doctrine-true. Prefer smallest green PR over hero branch.
- Security + money correctness + brand-scan + custody rules — raise them before I know to ask.
- When ambiguous on money/custody/jurisdiction: stop and ask me (product) or cite doctrine.

SESSION DEFAULT
- Orient from START-HERE + tracker + open PRs (60s reality check), then execute the task I give.
- If I only want status: plain map + next 2–3 moves + one recommended claim. No code.
- Never install/run Strix or live exploit frameworks unless I explicitly say go and name a non-prod target.
```

---

## Why this prompt is shaped this way

| Piece                   | Unspoken need it covers                  |
| ----------------------- | ---------------------------------------- |
| Operator mode           | You never become the git bottleneck      |
| Asymmetric review       | Speed without fake Approves              |
| Live re-verify          | Stale “already true” won’t poison a chat |
| Denon open-PR rule      | No double-build of matching/web          |
| Hard bans in the prompt | Cold agents still hit the money bar      |
| “No ship without ask”   | You keep control of what lands           |
