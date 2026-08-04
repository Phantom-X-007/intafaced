# ADR: retire `apps/web`, port the terminal into the Vue shell

**Status:** **Accepted — 2026-08-03.** Owner decision, stated and confirmed.
**Decision owner:** repo owner. **Written by:** Denon.
**Supersedes in scope:** the front-end half of [`2026-07-28-vendored-exchange-ui.md`](2026-07-28-vendored-exchange-ui.md) — that ADR chose to port vendored screens _into_ `apps/web`; the direction is now the reverse.
**Depends on:** [`2026-08-02-adopt-vendored-product-keep-our-ledger.md`](2026-08-02-adopt-vendored-product-keep-our-ledger.md) (Accepted). This closes the open question left at its §"Open, and owner-gated".

---

## The decision

> **`apps/web` retires. The terminal ports.**
>
> The vendored Vue shell at `vendor/upstream-exchange/05_Web_Front` becomes the sole product surface. Everything genuinely built in the Next scaffold moves there. Nothing is lost — including the reasoning for what is deliberately dropped.

The 2026-08-02 ADR left three options open: `apps/web` retires, becomes the admin/marketing surface, or has its trade terminal ported into the Vue shell. The answer is the first **and** the third. There is no third surface.

This is settled. Agents and engineers implement it; they do not re-litigate it.

---

## Why one surface and not two

The repo has already paid for this lesson once, and it is recorded at §"Why the front-end half of this went wrong" of the 2026-08-02 ADR: the shell was not deployable, `apps/web` was, and so `:3000` became the de-facto product **because it was the only thing that started**. Nobody decided that.

Keeping `apps/web` as "the admin/marketing surface" would recreate exactly that condition — two trees, one of which is easier to run, and a slow drift of features into whichever one an agent opened first. Two surfaces means two design idioms, two token systems, two honesty conventions and two places a price literal can hide. The shell has 74 finished screens; the scaffold has a good terminal. One of those is a product.

---

## What ported

The scaffold's real work is on the shell today:

- **Order entry, blotter, depth and public tape**, against svc-edge rather than the retired Java venue — `vendor/upstream-exchange/05_Web_Front/src/config/intafaced.js`.
- **Charts.** `assets/js/market-chart/kline.js` on the same `lightweight-charts` build the scaffold used, reading real OHLCV. No invented candles.
- **Hotkeys** (#337), **honesty pass** (#349), **sub-account selector** (#358), **a11y** (#367) — the desk craft, landed on the shell directly rather than ported after the fact.
- **The empty-state discipline**, improved in transit — see below.

### Still to port, and named so it is not forgotten

1. **The live feed.** The shell has **none**. `Exchange.vue:1020` hardcodes `feedLive: false`, and the whole screen is honest about it — the head badge reads "No feed · not live prices" and the formatters refuse to render a zero as a price while it is false. That is correct behaviour for a surface with no socket, and it is not a substitute for the socket.
2. **Runtime shape validation** of every edge response.
3. **Decimal-safe desk arithmetic.** `bignumber.min.js` is vendored under `assets/js/`, but `ix-trade.js` does not reference it. The library being present is not the same as the desk using it.

Until 1–3 land, the port is **not** complete, and `web.terminal` stays `wip`.

---

## What is deliberately DROPPED, and why

This section exists so that "we lost it" and "we decided against it" stay distinguishable a year from now.

### `grid-backdrop.tsx` — dropped

A phosphor-bloom backdrop. It is good work and it belongs to a different product. The shell's look is the vendor's, and it is coherent; dropping a second visual idiom into it would produce a surface that reads as two half-finished designs rather than one finished one. **Reason: idiom conflict, not quality.**

### `data-table.tsx` — dropped, the shell's equivalent is better

`DataTable` keeps **two** states apart: rows, or an `emptyLabel`. The shell's `ix-trade.js` `sectionEmptyLabel()` keeps **three**:

```
loading   we have not heard back           → "Loading…"
failed    we heard a refusal               → the reason, named
empty     we heard, and there is nothing   → the honest empty sentence
```

That third distinction is the whole point on a venue where nothing has traded yet. Under `DataTable`, "the service is down" and "the book is empty" render identically — which is the exact class of lie this repo is built not to tell. The shell's version is the better one and it stays.

### `depth-ladder.tsx` — dropped, same reason

Superseded by the shell's book, which is wired to the same three-state discipline.

### `app/trade/page.tsx` and `app/layout.tsx` — dropped, superseded

Next-specific routing and provider plumbing with no analogue to carry over.

**Worth recording, because it is a genuine improvement and not merely a wash:** `layout.tsx` had to publish `NEXT_PUBLIC_EDGE_URL` and `NEXT_PUBLIC_WS_URL` into the browser bundle — two build-time origins that must be right at image-build time and are wrong in every environment nobody remembered to rebuild for. The shell needs **no browser-visible origin env at all.** `EDGE_BASE = '/api'` is same-origin, and nginx proxies `/api` → svc-edge and `/ws` → svc-ws **by service name**. Fewer knobs, no baked-in hostnames, and one less way to ship a build pointed at localhost. That is strictly better.

---

## What the OLD app was better at

Recorded so the port is not mistaken for a pure win, and so nobody re-derives these from scratch.

- **A live websocket depth feed, with sequence-gap detection and resnapshot.** `applyDelta` on a sequenced stream, tested against a 200-tick replay rebuilt client-side. The shell has no live feed at all. This is the single largest thing the scaffold had that the shell does not.
- **Runtime shape validation of every response.** Zod at the edge client, with `Result` instead of throws, so a service that changed shape produced a named failure rather than a blank panel. The shell has none.
- **Decimal-safe arithmetic on the desk.** Doctrine §0 money handling carried all the way to the surface.

Three things, all of them real. They are the port's remaining work, not a reason to reverse the decision — the shell is 74 screens ahead and these are three files.

---

## The one decision that must be recorded explicitly: `platform-status.tsx`

`platform-status.tsx` is a masthead health badge. It fires **once on mount** — `useService` re-runs only on `[key, nonce, idleReason]`, and `PlatformStatus` never calls `reload()`. There is no interval.

In Next that was survivable: client navigation remounts, so moving around the app re-probed the fleet as a side effect. It was never designed behaviour, but it was frequent enough to be roughly honest.

**In the Vue SPA it is not survivable.** `App.vue` mounts once for the whole session. A naively ported badge would go green at boot and stay green through a total fleet outage, for as long as the tab is open — and it sits in the masthead of every screen.

That is a **worse lie than the "Systems nominal" constant it was written to replace.** The constant is at least obviously a slogan; a badge that measured something once and then reports that measurement forever looks like live instrumentation. It would be the honesty regression with the widest blast radius on the product.

**Decision: port it only with an interval refresh, or do not port it.** A masthead badge with no refresh loop is not an acceptable third option, and a reviewer should reject that PR on sight.

---

## What this obliges

### The tracker moves in the same commit as the deletion

`tooling/scripts/tracker.mjs` checks `requires` paths **only when `status === 'done'`** (`:43-50`). That asymmetry cuts both ways and both rows are affected:

- **`web.shell`** is `done` with `requires: ['apps/web']`. The moment the directory goes it fails `tracker:check` — and therefore `gates.mjs` id `tracker`, `pnpm verify`, and CI. It is **not** deleted: deleting the row silently lowers the board score with no record of why, and its note is the canonical statement of the honesty work done there. It is retitled, repointed at the shell, and its note rewritten. Its `dependsOn: ['infra.ui-tokens']` is also removed — false of the shell, whose `assets/css/intafaced.css` defines its own `--ix-*` variables (204 of them) and does not consume `@intafaced/ui/tokens.css` anywhere.
- **`web.terminal`** is `wip`, so its path is **never** checked. It would keep pointing at a deleted directory indefinitely with nothing red. **That is the trap**, and it is the reason this ADR exists before the deletion rather than after it. Repointed at `Exchange.vue`.

### The doctrine moves too

`INTAFACED_DEFINITIVE_BUILD.md` §5.3 is literally titled `apps/web — Trade surfaces`. Per `CLAUDE.md` that file **is** the law and wins on ambiguity, so retiring the directory without amending §5.3 leaves the doctrine and the tree contradicting each other — and the doctrine wins, which would make the deletion the thing that is wrong. §5.3 is amended to name the vendored shell.

### Compose and the `:3000` door

`docker-compose.apps.yml` still publishes `web` on `3000:3000`. That row, and the `web` image build, go with the directory. It is not this branch's to remove.

---

## Open

Nothing about the surface. The remaining questions from the 2026-08-02 ADR — the wallet-RPC security review's scope and owner, and any decision to run `01_wallet_rpc` against real value — are untouched by this and remain owner-gated.
