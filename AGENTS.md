# Instructions for AI agents

INTAFACED. Ship the product. The user does not read code. Say what changed and what could go wrong in plain words. Do not ask them to review a diff.

## Ship

- Cut a worktree with `pnpm wt <branch>` and do the work there. The home folder stays untouched so several agents can ship at once.
- One service per pull request. Merge that pull request to main yourself as soon as your own review is done. That is how work reaches main. Leave the main branch itself uncommitted.
- Review your own diff with `/code-review` before you merge. CI does not gate the merge.
- Find code by the `services/` and `packages/` folders, then open the file. Do not use Graphify.

A result is on GitHub: a merged pull request, or an issue that names the file and the broken behavior. A chat summary is not a result.

Use a sub-agent only for a different service. Open one file it cites before you act.

## Money

- Value moves only through `packages/ledger-client`. No other module holds a balance.
- Money on the wire is a decimal string. Money in memory is a scaled bigint.
- A blank fee, amount, or list stays blank and the action refuses. Do not invent a number.

## Product

- Extend the existing shell, ledger, and `svc-*` services. Do not start a second app or a second money book.
- Leave FIX, SBE, Greeks, ccxt, and a second order book alone.
- Chain work stays parked. The record is `docs/adr/2026-09-03-protocol-rails-until-intachain.md`.

## Skills

Repo law beats an installed skill. A skill that adds a worktree with `git worktree add`, or that waits for CI, is wrong here.

Issues and specs are GitHub issues on Phantom-X-007/intafaced, via `gh`. Labels and domain paths: `docs/agents/`.

## Close out

When the pull request is merged and this folder is not the home folder, remove the worktree from home:

`git -C /Users/Nitro/projects/Sovereign worktree remove --force` and the path.

Leave the branch. Leave the home folder.
