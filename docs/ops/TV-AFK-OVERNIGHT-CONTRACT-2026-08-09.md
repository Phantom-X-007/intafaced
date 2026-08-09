# TV Program — AFK Overnight Contract (2026-08-09)

**Status:** ACTIVE · GO received (“Run the TV program AFK”)  
**Coordinator:** this agent session · single writer for site code  
**Worktree:** `/Users/Nitro/projects/sovereign-worktrees/tv-sovereign-os-site` · branch `feat/tv-sovereign-os-apply-site`  
**Runbook:** [`TRADINGVIEW-PROGRAM-ORDERED-METHODOLOGY-2026-08-09.md`](../TRADINGVIEW-PROGRAM-ORDERED-METHODOLOGY-2026-08-09.md)  
**Scoreboard:** [`TV-SITE-SCOREBOARD.md`](TV-SITE-SCOREBOARD.md)

---

## 0 · Meta-prompt (agents re-read every wave)

You are finishing the **TradingView Advanced Charts apply path** for Nitro (non-technical operator). He is AFK. He will **not** answer taste questions, pick options, or run commands.

**North star:** Public good-quality Sovereign OS page live on HTTPS → apply pack complete with that URL → he only returns to a finished packet (or one human credential line if truly blocked).

**Quality:** Professional dark + lime terminal/lobby energy. Good ≠ perfect. Ship.

**Laws:** Denon copy is word SoT. No payments-primary story. No Advanced Charts binary pre-grant. No vendor brand names. Marketing site ≠ product shell. Internet leverage over freehand. No dual writers on site package.

**Stop condition (only then message “FINISHED”):**

1. Live public HTTPS URL serves the site (custom domain preferred; stable preview allowed if DNS blocked)
2. W4 QA checklist 100% in scoreboard
3. Apply pack file has URL + blurbs + contacts filled
4. Scoreboard W0–W4 DONE; W5 = SUBMITTED or PACK-READY-HUMAN-CLICK with exact next action
5. Branch pushed; PR open if thrift/CI allows

**Do not stop for:** polish, second opinions, missing entity name (use best-known entity note in pack), missing Denon legal name (use email + “Denon / technical contact”).

**May mark BLOCKED only if:** no path to any public HTTPS URL after all deploy attempts (document attempts). Then still leave site complete in repo.

**W6 post-grant charts:** NOT in this overnight finish line.

---

## 1 · Unspoken needs (hard constraints)

| ID  | Need                     | Enforcement                                              |
| --- | ------------------------ | -------------------------------------------------------- |
| U1  | Zero oversight overnight | No questions mid-run; defaults locked                    |
| U2  | Compact chat on return   | One FINISHED packet + scoreboard + URL                   |
| U3  | Actually finishes        | Exit gates machine-checkable                             |
| U4  | Not slop                 | DESIGN locks + ban list in build                         |
| U5  | Fast TV bar              | Compress copy; full rooms named                          |
| U6  | Parallel safe            | W1/W2/W3 parallel; W4 single writer                      |
| U7  | Subagents if used        | Full brief + exit artifact path; no shared write on site |
| U8  | DNS may be human         | Preview URL OK; DNS runbook left                         |
| U9  | Form submit may be human | Pack-ready is agent done for W5 if no TV login           |
| U10 | State in files           | Scoreboard + contract always current                     |

---

## 2 · Wave exit gates (must fill scoreboard)

| Wave | DONE means                                                         |
| ---- | ------------------------------------------------------------------ |
| W0   | Copy bank + PRODUCT + DESIGN + claims + this contract + scoreboard |
| W1   | STACK-LOCK.md in sites package                                     |
| W2   | Host/DNS runbook; deploy method chosen                             |
| W3   | TV-APPLY-PACK.md skeleton                                          |
| W4   | Live URL + QA checklist all yes + screenshots paths                |
| W5   | Submitted OR pack-ready with one human click path                  |

---

## 3 · Defaults (no questions)

| Item               | Default                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Subdomain target   | `trade.intafaced.com`                                                                             |
| Interim public URL | Host preview / Pages / tunnel — whatever works first for HTTPS public                             |
| Entity on pack     | “Gate into Sensorium or Nitrogenics — confirm at submit” + email gateofsensorium@gmail.com        |
| Tech contact       | Denon · gateofsensorium@gmail.com                                                                 |
| Legal contact      | Same until named                                                                                  |
| Stack              | Static site (HTML/CSS/JS) in `sites/sovereign-os` — zero monorepo pnpm dependency for reliability |
| CTA                | `#waitlist` / mailto hello@intafaced.com style — not payments cal.com primary                     |
| Chart              | No Advanced Charts; optional CSS terminal mock only                                               |

---

## 4 · Subagent policy

| Job              | Subagent?                                                              | Output                      |
| ---------------- | ---------------------------------------------------------------------- | --------------------------- |
| W0 docs          | Coordinator                                                            | files                       |
| W4 site build    | Coordinator single writer (or one general-purpose with exclusive path) | sites/sovereign-os/\*\*     |
| Apply pack prose | Can parallel                                                           | docs/TV-APPLY-PACK.md       |
| DNS research     | Can parallel read-only                                                 | docs/TV-DNS-HOST-RUNBOOK.md |
| Never            | Two writers on index.html                                              | —                           |

---

## 5 · FINISHED packet shape (only message Nitro needs)

```
FINISHED — TV apply site
URL: …
QA: green
Apply pack: path
PR: …
You: (nothing | one line DNS | one line submit)
```

---

## 6 · Gaps closed

| Gap                     | Fill                                              |
| ----------------------- | ------------------------------------------------- |
| Frontend HOLD           | Lifted by GO                                      |
| pnpm missing in env     | Static site; no pnpm                              |
| Detached main checkout  | Worktree branch                                   |
| No vercel/wrangler      | Try GH pages / cloudflared / raw deploy; document |
| Entity ambiguous        | Pack notes both; submit-time pick                 |
| Denon full name missing | Email + role                                      |
| Perfect vs good         | Ship rule in methodology                          |
| Overnight crash         | Scoreboard + contract resume from last DONE wave  |

_Contract active._
