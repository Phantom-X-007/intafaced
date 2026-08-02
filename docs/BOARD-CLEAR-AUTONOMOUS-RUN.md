# Board Clear — Autonomous Run (GO prompt)

**Purpose:** One paste. World-class agentic engineering until the product board is Done/Cut.  
**Nitro is not in the tech loop.** No continue prompts. No vibe-code slop.  
**Version:** v3.2 · 2026-08-02 — AFK contract + dual finish gates + deferred human blockers.

---

## Cold start / compact read order

**0. FIRST AND ONLY FIRST:** `docs/BOARD-CLEAR-NEXT.md`  
**1. Scope honesty:** `docs/BOARD-CLEAR-AFK-CONTRACT.md`  
**Never** TRACKER / WAVE-AUDIT / chat summary as live SoT.  
**Never** ask Nitro to re-read anything after compact — agent does it alone.

Then: fetch + `gh pr list` · SCOREBOARD · AGENT-BACKLOG · SHEHZAD · DECISION-AUTHORITY · CONSTITUTION · PROCESS-LOOPS · ENGINEERING-STANDARD · SUBAGENT · LIVE-LANES · HUMAN-BLOCKERS · STREAM-A-DESIGN-BAR · AGENTS.md

---

## Enhanced GO prompt (copy entire fenced block)

```text
BOARD CLEAR — AFK FULL AUTONOMY (v3.2). Nitro away. Zero vibe-code. Zero continue prompts.
Pro-trader desk. Never invent mid/depth/rates/balances/candles.

SCOPE (read docs/BOARD-CLEAR-AFK-CONTRACT.md — binding):
- THIS SESSION owns AGENT-COMPLETE: all agent-owned rows Done/Cut with proof.
- BOARD-COMPLETE (incl. shehzad M1–M7) requires HIS merges/proof — agents NEVER steal M1–M7 to fake finish.
- Do not claim full board Done without his rows.

AFK / COMPACT (agent does alone — NEVER ask Nitro):
- After every compact: open docs/BOARD-CLEAR-NEXT.md → fetch → gh pr list → continue EXACT NEXT.
- No human post-compact step. Rewrite NEXT before every pause.

READ FIRST: docs/BOARD-CLEAR-NEXT.md
Then: docs/BOARD-CLEAR-AFK-CONTRACT.md
Then: git fetch && git log origin/main -3 --oneline && gh pr list --state open
Then: SCOREBOARD · AGENT-BACKLOG · SHEHZAD · DECISION-AUTHORITY · CONSTITUTION · LOOPS · ENGINEERING-STANDARD · HUMAN-BLOCKERS
NEVER trust: chat summary, TRACKER.md, WAVE-AUDIT as live SoT

PHASES (order is law):
A) Clear ALL agent residual ships (AGENT-BACKLOG) elite quality R→S→P→B→V→RV→M→U
B) Polish: pro UI design bar, tests, mock WS — still no M1–M7 implement
C) ONLY after A+B exhausted: flush docs/BOARD-CLEAR-HUMAN-BLOCKERS.md + report Nitro once
   — queue X1–X5 during A/B; do NOT surface mid-run if agent work remains

HUMAN @shehzad002 M1–M7: BABYSIT only (merge if Class M body + green CI). Parallel OPEN ≠ idle.

AGENT residual: A-TRADE-MM-3 (exact next) · A-UI-SUB/A11Y/PRO · A-P5-OPS/AGENTS · A-WS-MOCK-E2E · spot/venue ops · P-OR DONE

LOCKED B: protocol audit+deploy; trade HARD human / LIGHT agent; card=M1; Phase5 money=M6; #289 DONE

DECISIONS: agent default; Nitro X1–X5 only AFTER agent residual exhausted (queue in HUMAN-BLOCKERS)
Never tech multi-choice. Never “wait for shehzad.” Never “continue?”

ANTI-SLOP: evidence block; Class M failure tests; design bar; no invent; no fake Done; no apps/web product

LOOPS L0–L9. SUBAGENTS 3–5 agent programs only PATHS_ONLY.

EVERY TURN: worktree; update NEXT exact ship; evidence; thrift verify; GH_TOKEN from ~/.grok/agent-auth/github_token

START NOW:
1) NEXT EXACT = A-TRADE-MM-3 → ship
2) Drain agent backlog → AGENT-COMPLETE
3) Flush HUMAN-BLOCKERS if human rows remain
4) Report: AGENT-COMPLETE + blockers OR BOARD-COMPLETE if scoreboard all Done/Cut

No process theater. No Nitro in loop while session lives.
```

---

## Host rule (honest)

While **this agent session is alive**, Nitro does **nothing** after GO — including after compaction.  
If the **process/chat dies entirely**, nothing runs until a host restarts an agent with the same GO paste (optional scheduler). That is infrastructure, not “Nitro tech homework.”

---

## Auth

```bash
export GH_TOKEN="$(tr -d '\n\r ' < /Users/Nitro/.grok/agent-auth/github_token)"
```
