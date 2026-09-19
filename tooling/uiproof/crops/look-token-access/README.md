# Token access LOOK evidence

Source/spec commit: `b11629923dfac2b63863b6ed512d421ced056fcf`.
The following evidence commit adds only this directory; Token.vue and the test are unchanged.

Task: inspect access and active stakes first, then deliberately open staking or service operations. Native details preserve drafts and existing Vue/iView bindings. Product changes are template/CSS only.

- `1440.json` / `390.json`: exact worktree, source/script hashes, Chromium version, unique-port server SHA, fixture, route, task and crop hashes.
- `*-down.png`: anonymous, all API reads HTTP 503; unavailable never becomes zero.
- `*-empty.png`: anonymous, listStakes returns HTTP 200 `[]`; all other reads HTTP 503. No money, tier or discount is seeded.
- `*-stake.png` / `*-operations.png`: same partial-empty fixture, keyboard-opened forms. Fixed viewport crops are scrolled to show the forms; service operations continue below the mobile crop.
- `SHA256SUMS`: all eight 1440×900 / 390×844 PNGs.

## Validation

`fail-first.txt`: baseline f5f0fb68 fails at both widths because the Stake heading is visible before disclosure. The script equality check passes.

`pass.txt`: 3/3 pass on the source commit. Covers source script byte equality, unavailable/partial-empty distinction, reads-first layout, collapsed actions, keyboard activation, draft retention across close/reopen, no page overflow and no write requests.

Existing token-stake, token-yield-job and token-governance-tally golden checks pass. token-buyback-job has three pre-existing backend source-match failures (IOC / market / buy); `buyback-baseline.txt` reproduces them with origin/main Token.vue. No backend changes are included.

Claim: BROWSER-PROVED only for the named Chromium layout and disclosure interactions. Anonymous stubbed empty/degraded responses do not prove live money, session authorization, mutation correctness, AT, or frontend completion. Script SHA256: `88f7cb237753c614d538efca010946e3662affd218bf0b3f00a5d38bb71193e5`.

Independent review (`token_review`, read-only) at `1d9598abd` (Token.vue and all eight crop hashes unchanged after test formatting and rerun on `b11629923`): verified all eight image hashes and exact source SHA, reviewed collapsed and opened 1440/390 crops, compared the script, and found no introduced blocker. Narrow LOOK crop review passed; the claim limits above remain.
