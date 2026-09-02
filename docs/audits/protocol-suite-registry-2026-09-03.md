# Protocol plane — suite registry (internal audit package)

**Status:** Internal package · **not** `audited:true`. Engineering intake for external firms.
**Scope:** Every pinned compile suite in `services/svc-protocol/scripts/contract-sources.mjs`.
**Owner:** `@shehzad002`
**Date:** 2026-09-03

---

## 1 · What this package is

This is the **catalog** an external auditor receives after Nitro funds a review. It names every
on-chain suite, what product row it maps to, and where adversarial proof already lives.

- **Suite `sourceHash` values are not duplicated here** — they are served live from
  `protocol.auditRegistry` so a stale markdown table cannot lie about bytecode input.
- **Markdown package hash** (`artifactHash` on `auditStatus` / `auditRegistry`) covers _this file only_.
- **`audited:true`** requires `docs/audits/external-claims.json` with `kind: external`, a named firm,
  and `expectedHash` matching the committed report bytes. See `EXTERNAL-AUDIT-INTAKE.md`.

---

## 2 · Suite map (names only — hashes via API)

| Suite         | Board / tracker anchor                          | Primary contracts                                              |
| ------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| `accounts`    | S-A1 smart accounts                             | SmartAccount, AccountFactory, SessionKeyLib                     |
| `passkey`     | S-A9 / socket.p256-verifier                     | PasskeyOwner, P256                                             |
| `recovery`    | socket.social-recovery                          | UserElectedRecovery                                            |
| `paymaster`   | S-A10 / socket.paymaster-policy                 | ScopedPaymaster                                                |
| `escrow`      | S-A3 protocol.escrow                            | SovereignEscrow                                                |
| `launch`      | launch.token-factory                            | SovereignToken, TokenFactory                                   |
| `amm`         | protocol.amm                                    | ConstantProductPool, PoolFactory                               |
| `oracle`      | S-A12 socket.price-oracle                       | FailClosedOracle                                               |
| `lending`     | S-A4 protocol.lending                           | IsolatedLendingMarket                                          |
| `merchant`    | S-A6                                            | MerchantAccept                                                 |
| `router`      | S-A5 protocol.router                            | SovereignRouter                                                |
| `vaults`      | S-L1/L2/L4/L5                                   | CrewVault, LegacyVault, TreasuryYieldVault, trust/*           |
| `privacy`     | S-L3                                            | StealthAnnouncer                                               |
| `venue`       | S-C1 / socket.clob-contracts                    | SovereignVenue                                                 |
| `entrypoint`  | S-A11 socket.userop-differential-test           | EntryPointGetUserOpHash                                        |
| `meme`        | launch.meme-factory                             | MemeLaunch                                                     |
| `launchpad`   | S-G2 launch.launchpad                           | FairLaunch                                                     |
| `attestations`| S-F1 blueprint.attestations                     | RankAttestation                                                |
| `rwa`         | S-G4 launch.rwa                                 | RwaRegistry                                                    |
| `card`        | S-E1 sovereign card                             | CardPull, ICardPull                                            |
| `nft`         | S-G3 launch.nft                                 | SovereignNft, RoyaltyMarket                                    |

---

## 3 · Internal adversarial proof already on tip

| Area            | Package / test                                                                 |
| --------------- | ------------------------------------------------------------------------------ |
| Smart accounts  | `docs/audits/protocol-smart-accounts-2026-08-08.md` + `adversarial-audit.test.ts` |
| AMM             | `src/amm/invariants.test.ts`                                                   |
| Session keys    | `test/forge/SessionKey.t.sol`                                                  |
| UserOp hash     | `userop.entrypoint.onchain.test.ts`                                            |
| Venue reorg     | `sovereign-venue-reorg.onchain.test.ts`                                      |
| Card pull       | `card-pull-honesty.test.ts`, `issuer-adapter.test.ts`                        |

Passing these suites does **not** close `socket.contract-audit` or flip `audited:true`.

---

## 4 · Residuals before any external sign-off

1. Nitro selects and **pays** a firm (budget — not an engineering gate).
2. Firm reviews the suite list + live `sourceHash` fingerprints from `auditRegistry`.
3. Firm report committed under `docs/audits/external/` with a row in `external-claims.json`.
4. `socket.contract-audit` closes only when at least one external claim evaluates to `audited:true`.

---

## 5 · Findings log

| ID  | Severity | Status | Summary                                      |
| --- | -------- | ------ | -------------------------------------------- |
| —   | —        | —      | No external audit yet. Internal packages only. |
