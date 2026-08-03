# Claim locks (`docs/ops/claims/<id>.md`)

**Authority (spawn free / not free):** claim-lock files win over `residual-register.json` and over open-PR path collision for _closure_. Open-PR collision still **blocks dual-write** while a PR is open.

## residual-own

**residual-own** = this claim is closed without a further product PR: the tip already satisfies the DoD, with a **checkable proof string** on the claim file (not a vibe assertion).

Required fields:

```md
**status:** residual-own
**proof:** #468 · baseline rows removed · scan exit 0
```

Bad: `already honest` (assertion, not proof).  
Good: `#468 · baseline rows removed · scan exit 0` · `#462 · MinTrade mine_amount gone · gates 16/16`.

Other statuses: `claimed` (live writer), `pr-open` (link required), `merged` (PR number), `retired` (no target path).

Do not hand-edit `docs/LIVE-LANES.md` mid-wave — use these files.
