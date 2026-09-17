# Rebar queue — 2026-09-17 (audit-3)

**Law:** [`docs/SPEC-REBAR-ALL-OUT-2026-09-17.md`](../../SPEC-REBAR-ALL-OUT-2026-09-17.md)  
**STATUS:** [`REBAR-STATUS.md`](REBAR-STATUS.md) — mill writes `FINISHED` after squash-merge + cleanup. Nitro has no step.  
**Leftover:** `PLAN` · `OPEN` · unfalsified `IN-LEAD` · unexploded `HMAC-LIST`  
**Terminal:** `LIVE-DOOR` · `NAMED-REFUSE` · `SEALED` · `SOCKET` · `FRONTEND` · `KEEP` · `SKIP`  
**`IN-LEAD`:** merged PR named; Stage 1 default-kill; **no writer** until falsify.  
**`OPEN`:** only after Stage 1 + critic (`path:line` missing door).

Do not recook M00–M28. Taxonomy (FAILURES #13): SEALED / leftover-software / SOCKET / OWNER-SET / FRONTEND.

| id                | service                  | status    | evidence / falsify file                                               |
| ----------------- | ------------------------ | --------- | --------------------------------------------------------------------- |
| H1                | svc-fix                  | IN-LEAD   | compose `FixAcceptorMain` claimed on tip — confirm process door       |
| H1b               | svc-fix                  | PLAN      | drop-copy second session                                              |
| H2                | svc-matching             | IN-LEAD   | #3783 `l3.router.test.ts`                                             |
| H2-ws             | svc-ws                   | PLAN      | L3 from native queue, never L2 — matching half ≠ WS half              |
| H3                | svc-ws                   | IN-LEAD   | #3968 SBE octets                                                      |
| H4                | svc-matching             | IN-LEAD   | #3796 combo one instrument                                            |
| H4-trade          | svc-trade                | PLAN      | combo ledger holds — matching half ≠ trade half                       |
| H5                | svc-matching             | IN-LEAD   | #3787 mass-quote                                                      |
| H6                | svc-trade                | IN-LEAD   | #3790 JobHost dated settlement                                        |
| H7                | svc-trade                | IN-LEAD   | #3792 QuantLib link-or-refuse — **not** “no Sep commits”              |
| H7-adapter        | greeks-adapter           | IN-LEAD   | QuantLib 1.43 hitch                                                   |
| H8-skip           | money roots              | SOCKET    | register = `svc-pay` `evm-chain.live.test.ts` anvil only; do not mill |
| H8c               | svc-trade                | IN-LEAD   | #3831                                                                 |
| H8c-matching      | svc-matching             | IN-LEAD   | #3815                                                                 |
| H8e               | svc-matching             | IN-LEAD   | #3807/#4245 FileJournal                                               |
| H9                | svc-matching             | IN-LEAD   | #3800                                                                 |
| H10               | svc-execution            | IN-LEAD   | #3850/#3855 basket children                                           |
| H11               | svc-dex                  | IN-LEAD   | compose `DEX_INTERNAL_BOOK_FEE_BPS:-` empty                           |
| A1                | svc-matching             | IN-LEAD   | #3702 STP surveillance                                                |
| A2                | svc-trade                | IN-LEAD   | #3703 convert 10/200 refuse                                           |
| A3                | svc-execution            | PLAN      | hitch startBasket or prove live                                       |
| A4                | svc-execution            | PLAN      | hitch POV slice or prove live                                         |
| A5                | svc-fix                  | PLAN      | CompID/TIF map before POST                                            |
| A6                | svc-fix                  | PLAN      | strip ack passthrough                                                 |
| A7                | svc-matching             | PLAN      | rulebook compose empty ≠ invented version                             |
| R-A7              | svc-matching             | PLAN      | same family as A7 — Stage 1 merge or kill duplicate                   |
| R-E5              | svc-trade                | PLAN      | exercise/assignment/expiry jobs                                       |
| R-E6              | svc-trade                | IN-LEAD   | #3806 delta-hedge unset refuse                                        |
| R-E7              | svc-trade                | PLAN      | what-if posts no money                                                |
| R-E8              | svc-trade                | SOCKET    | do not redo                                                           |
| R-copy            | svc-trade                | PLAN      | follow closed; Stage 1 name file                                      |
| R-agentic         | svc-agents               | PLAN      | install ≠ trade                                                       |
| R-fx              | svc-trade                | PLAN      | FX separate                                                           |
| R-quant           | svc-quant                | PLAN      | paper ≠ ledger                                                        |
| R-security        | svc-identity             | PLAN      | dual-control privileged                                               |
| R-onboard         | svc-identity             | PLAN      | limit/fee-tier dual-control                                           |
| R-promo           | svc-trade                | PLAN      | promo without budget/end refuse                                       |
| R-auth            | svc-identity             | PLAN      | session/API-key on order/fill                                         |
| Q-proto           | svc-protocol             | PLAN      | #3746 **closed unmerged** — falsify unaudited + AMM 0x0 **on tip**    |
| Q-index           | svc-indexer              | PLAN      | fixture ≠ live CLOB                                                   |
| Q-dex             | svc-dex                  | IN-LEAD   | duplicate of H11 — Stage 1 kill                                       |
| Q-pay             | svc-pay                  | PLAN      | chargeback recipe or named refuse                                     |
| Q-bank            | svc-bank                 | PLAN      | card-sim ≠ issuer; cooling already IN-lead elsewhere                  |
| Q-token           | svc-token                | PLAN      | unpublished mint refuse                                               |
| Q-mine            | svc-mining-pool          | IN-LEAD   | JobHost mint/reward IN — confirm door                                 |
| Q-edge            | svc-edge                 | PLAN      | WS proxy leftover named                                               |
| Q-notify          | svc-notify               | PLAN      | in-app; Class X dark — default NAMED-REFUSE/KEEP                      |
| Q-p2p             | svc-p2p                  | PLAN      | unencrypted → refuse live offers                                      |
| Q-market          | svc-market               | PLAN      | recurring refuse; blank commission ≠ 0                                |
| Q-ledger          | svc-ledger               | KEEP      | do not recut statements                                               |
| Q-ops             | svc-ops                  | PLAN      | wrap/freeze unset refuse                                              |
| Q-tax             | svc-tax                  | SOCKET    | jurisdiction map OWNER                                                |
| Q-academy         | svc-academy              | KEEP      | paper ≠ ledger                                                        |
| Q-agents          | svc-agents               | PLAN      | with R-agentic                                                        |
| Q-support         | svc-support              | KEEP      | no refund money (not SKIP)                                            |
| Q-blueprint       | svc-blueprint            | SKIP      | mock / no money                                                       |
| Q-rust            | svc-matching-rust-stage1 | SKIP      | TS matching SoT                                                       |
| S2-1              | svc-bank                 | PLAN      | earn.deposit retry                                                    |
| S2-2              | svc-bank                 | PLAN      | standing-order retry                                                  |
| S2-3              | svc-bank                 | PLAN      | getTxByKey stub                                                       |
| S2-4              | svc-bank                 | IN-LEAD   | `add-collateral-retry-id.test.ts` claimed — confirm                   |
| S2-5              | svc-bank                 | PLAN      | repay retry                                                           |
| S2-6              | svc-bank                 | PLAN      | proposeTransfer retry                                                 |
| S3-2              | svc-trade                | IN-LEAD   | planMirror invented fill — confirm test                               |
| S3-3              | svc-trade                | PLAN      | OTC quote retry                                                       |
| S4-3              | svc-ledger               | PLAN      | non-recipe post `s2s-http.ts`                                         |
| S8-1              | svc-ws                   | IN-LEAD   | JWT-after-expiry close claimed — confirm                              |
| S14-1             | venue-adapter            | PLAN      | empty consensus                                                       |
| S14-2             | venue-adapter            | PLAN      | price 0                                                               |
| AUG7-funding      | svc-trade                | IN-LEAD   | `margin_current` on tip — default kill; no Class M from paragraph     |
| HMAC-compose      | packages/config          | SEALED    | `internal-service-body-bind-compose-pin.test.ts` forbids `:-require`  |
| HMAC-LIST         | inbound mutate S2S       | HMAC-LIST | Stage 1 closed list or empty; no GET clients; no compose flip         |
| pkg-ledger-client | packages/ledger-client   | KEEP      | only money writes; dual-book scan on money PRs                        |
| pkg-sbe           | packages/sbe-codec       | IN-LEAD   | hitch H3                                                              |
| pkg-greeks        | packages/greeks-adapter  | IN-LEAD   | hitch H7                                                              |
| pkg-contracts     | packages/contracts       | SEALED    | Zod 3; no Zod 4                                                       |
| pkg-events        | packages/events          | KEEP      | NATS                                                                  |
| pkg-execution-mm  | packages/execution-mm    | KEEP      | MMP law in-repo                                                       |
| pkg-execution-arb | packages/execution-arb   | KEEP      | external-only house                                                   |
| pkg-venue         | packages/venue-adapter   | PLAN      | with S14                                                              |
| pkg-market-data   | packages/market-data     | KEEP      | do not fork                                                           |
| pkg-auth          | packages/auth            | KEEP      | WebAuthn adapter                                                      |
| pkg-quant-honesty | packages/quant-honesty   | KEEP      | with R-quant                                                          |
| pkg-db-config     | packages/db + config     | KEEP      |                                                                       |
| pkg-ui            | packages/ui              | FRONTEND  | Codex                                                                 |
| 05_Web_Front      | vendor                   | FRONTEND  | Codex                                                                 |
| W0-3777           | docs                     | SOCKET    | closed **unmerged** harden spec — not a mill                          |
| W0-3708           | docs                     | SOCKET    | closed **unmerged** inventory                                         |
| W0-3746           | svc-protocol             | PLAN      | closed **unmerged** — Q-proto tip falsify                             |
| W0-3707           | deps                     | SOCKET    | closed unmerged GHSA — not mill stop                                  |
| P1-chain          | svc-chain                | SOCKET    | INTACHAIN ADR                                                         |
| mega-§2           | owner env                | SOCKET    | never invent                                                          |
| money-skip-evm    | svc-pay                  | SOCKET    | only register row; anvil CI                                           |
