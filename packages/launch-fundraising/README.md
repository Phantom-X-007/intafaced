# @intafaced/launch-fundraising

Stage-1 **fiat-plane** fundraising registry (tracker `launch.fundraising`).

Off-chain campaign + milestone records + investor list. **Does not** post the ledger, invent a raise cap or token price (D26-P0-13), or talk to chain escrow/vesting (Shehzad).

`svc-launch` is not in this PR: a new service fails workspace-sync without compose YAML, which this slice must not edit. The reachable consumer is `svc-blueprint` (`launch.createCampaign` / `addMilestone` / `listInvestors`).

## API

| Call             | Behaviour                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `createCampaign` | Refuses unless **both** cap and price are caller-supplied positive decimal strings. No defaults.               |
| `addMilestone`   | Off-chain title/note only. No chain fields.                                                                    |
| `listInvestors`  | Honest empty list. Committed amount is summed from records (`"0"` when none) — never a stored “raised” figure. |

## Events

None. Stage-1 does not publish bus events.

## Ledger recipes used

None. This package must not import `@intafaced/ledger-client`.
