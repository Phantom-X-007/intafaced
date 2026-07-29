# svc-protocol

**The Protocol Plane's smart account layer (§17.4, §17.5).** Self-custody ERC-4337 accounts, deterministic addresses, and scoped session keys — the foundation the AMM, the lending markets, the sovereign escrow, the Lane A merchant contracts and the sovereign card all sit on.

**This service is non-custodial, and that is a structural fact rather than a policy.** It holds no key, posts no ledger transaction, and has no function anywhere in it that can move a user's funds. `pnpm scan:custody` asserts it on every build (Doctrine §16.10), and `src/sovereignty.test.ts` asserts it again from inside the service.

> **What, structurally, prevents the platform from moving a user's funds here?**
>
> 1. **We hold no key that the account recognises.** `SmartAccount` accepts exactly one unrestricted signer, `owner`, set at deployment to the user's key. There is no admin role, no operator, no pause, no guardian.
> 2. **The account cannot be upgraded.** It is an EIP-1167 clone: the implementation address is hard-coded in its own runtime bytecode. There is no beacon and no registry to re-point. We could not swap in code that moves funds even with every key we possess.
> 3. **The one thing we do hold — a session key — is refused transfer power at grant time.** `SessionKeyLib.assertGrantable` reverts on any selector that moves a token or hands out an allowance, and refuses the account itself as a target, so a session can never widen itself.
> 4. **There is no signing key in the service at all.** `src/env.ts` declares none, `src/chain/client.ts` creates only a `PublicClient`, and a test fails the build if either changes. The service builds calldata and forwards operations the user already signed; `SessionRelay.verify` re-derives the operation hash and refuses anything whose signature is not the owner's or a live session key's.
> 5. **Nothing here is load-bearing for the user.** The registry is a read model. If this service, this database and this company all vanished, every user would still reach their funds from any wallet, at an address derived from their own key, on a chain we do not run.

---

## API

Internal tRPC (`createProtocolRouter`). Read the guards, not just the procedures.

Almost everything is `publicJurisdictionProcedure('protocol', 'protocol')` — **no login, no KYC tier, no account gate.** That is §22 as code: `MODULES.protocol` is `custodial: false` on the `protocol` plane, so `checkAccess` returns `allowed.permissionless`. There is nothing to verify because there is nothing held.

| Procedure                | Guard           | Input                                              | Output                                                     |
| ------------------------ | --------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| `health`                 | —               | —                                                  | `{ ok, service, chainId, custodial: false, relayEnabled }` |
| `predictAddress`         | permissionless  | `{ owner, userSalt? }`                             | `{ address, chainId, factory, implementation, deployed }`  |
| `buildDeployment`        | permissionless  | `{ owner, userSalt? }`                             | unsigned call + `predictedAddress`                         |
| `buildSessionGrant`      | permissionless  | `{ account, spec }`                                | unsigned call + `specHash`, `validUntil`                   |
| `buildSessionRevoke`     | permissionless  | `{ account, sessionKey }`                          | unsigned call                                              |
| `buildRevokeAllSessions` | permissionless  | `{ account }`                                      | unsigned call                                              |
| `sessionStatus`          | permissionless  | `{ account, sessionKey }`                          | on-chain record: expiry, `spentWei`, `revoked`, `live`     |
| `checkSessionCall`       | permissionless  | `{ account, spec, target, value, data, spentWei }` | `{ allowed, code, reason, spentAfterWei }`                 |
| `sessionSpecHash`        | permissionless  | `{ account, spec }`                                | `{ specHash }`                                             |
| `relayUserOperation`     | permissionless  | `{ account, userOp }`                              | `{ userOpHash, authority: 'owner' \| 'session' }`          |
| `bindingMessage`         | `protocol:read` | `{ address }`                                      | `{ message }`                                              |
| `claimAccount`           | `protocol:read` | `{ owner, address, userSalt?, signature }`         | `{ id, address, owner, deployed }`                         |
| `myAccounts`             | `protocol:read` | —                                                  | `AccountRecord[]`                                          |

The two authenticated procedures are the registry ones, and they are authenticated for a mundane reason: attaching an address to an INTAFACED profile requires knowing whose profile it is. They confer no power over the account.

**There is no `protocol:write` scope in `packages/auth`, deliberately — the same way there is no `ledger:write`.** No user token and no platform credential may authorise anything on this plane. The only thing that authorises here is a signature from the user's own key.

HTTP: `GET /health` (liveness) · `GET /ready` — 503 when the chain is unreachable, because a service that cannot read the chain cannot answer any question a user has.

`src/index.ts` re-asserts §22 at boot and **refuses to start** if `checkAccess` for this module ever returns anything but `allowed.permissionless`.

---

## Events

**Publishes** — all three are observations of chain state, never records of something the platform did.

| Subject                                    | When                     | Payload                                                                 |
| ------------------------------------------ | ------------------------ | ----------------------------------------------------------------------- |
| `intafaced.protocol.account.created`       | factory `AccountCreated` | chain, account, owner, salt, tx, optional user id                       |
| `intafaced.protocol.session_key.created`   | account `SessionGranted` | account, key, spec hash, validity window, spend cap, targets, selectors |
| `intafaced.protocol.session_key.cancelled` | account `SessionRevoked` | account, key, who revoked it, tx                                        |

Note what none of them carry: no balance, no key material, no amount that moved. There is nothing of the user's for these payloads to describe.

Idempotency keys are business keys (`protocol.account:<chain>:<address>`, `protocol.session:<account>:<specHash>`), so at-least-once redelivery finds the original.

**Consumes** — nothing.

> **§13 socket — `indexer.readmodels`.** `src/events.ts` watches the chain itself: one factory address plus two account event topics. That belongs in `svc-indexer` and moves there when `indexer.readmodels` lands. It is here rather than deferred so smart accounts are usable now, and it is deliberately narrow so the move is a deletion.

---

## Ledger

**This service posts no ledger transactions and holds no user value. On this plane the user's keys are the only keys.**

There are no recipes to list, because there is no code path here that reaches one. `@intafaced/ledger-client` is not a dependency of this package, in any form:

| Check                                                           | Where                                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------- |
| No ledger-client import, no `ledger.post()`                     | `tooling/ci/custody-scan.mjs`, and again in `src/sovereignty.test.ts` |
| No ledger-client entry in `package.json`                        | `src/sovereignty.test.ts`                                             |
| No `PRIVATE_KEY`-shaped environment variable                    | `src/sovereignty.test.ts`                                             |
| No `createWalletClient` / `privateKeyToAccount` in shipped code | `src/sovereignty.test.ts`                                             |
| No owner- or admin-callable path to move funds in any `.sol`    | `custody-scan`, and again in the test suite                           |
| No `selfdestruct`, no upgrade path                              | same                                                                  |

`ReadOnlyLedgerClient` is permitted on this plane and is **not used**, because nothing here needs a fiat-plane balance to answer a question about a self-custody account.

The one seam between the planes is `svc-bridge`, which is custodial by design (§17.3). It is not this service and must never become it.

---

## The contracts

`contracts/`, Solidity ^0.8.24, no external imports — every byte an INTAFACED account is built from is in this repository.

### `SmartAccount.sol`

ERC-4337 v0.7 account, deployed as an immutable clone.

| Function                                                             | Who can call it                                                   |
| -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `initialize(owner)`                                                  | once, by the factory, at deployment                               |
| `execute` / `executeBatch`                                           | owner (directly, or via an owner-signed user operation)           |
| `executeWithSession(spec, target, value, data)`                      | the session key, or the EntryPoint after validating its signature |
| `grantSession(spec)`                                                 | owner                                                             |
| `revokeSession(key)`                                                 | owner, **or the session key retiring itself**                     |
| `bumpSessionEpoch()`                                                 | owner — kills every outstanding session in one call               |
| `proposeOwner` / `acceptOwnership`                                   | owner, then the incoming key                                      |
| `validateUserOp`                                                     | EntryPoint only                                                   |
| `isValidSignature` (ERC-1271)                                        | anyone; **valid for owner signatures only**                       |
| `owner`, `entryPoint`, `sessionEpoch`, `getSession`, `isSessionLive` | anyone, view                                                      |

There is no function on that list an INTAFACED address can call.

Four decisions worth their own line:

- **No upgradeability.** An upgradeable account is a custodial account with extra steps.
- **ERC-1271 answers for the owner only.** A session key that could produce a valid 1271 signature could sign an off-chain permit and empty the account without ever calling it.
- **`bumpSessionEpoch` is a panic button the user holds and we do not.** Every granted session records the epoch it was granted under; one owner call invalidates all of them. Ownership transfer bumps it automatically, so sessions die with the key that granted them.
- **A passkey owner works today.** If `owner` is a contract, signature validation goes through ERC-1271 — so a deployed P-256 verifier is an owner with no change to the account. The verifier contract itself is a §13 socket.

### `SessionKeyLib.sol` — how session keys are scoped

```solidity
struct SessionSpec {
    address   key;            // the delegated signer
    uint48    validAfter;     // unix seconds; 0 = immediately
    uint48    validUntil;     // MANDATORY, and ≤ 30 days out
    uint128   spendLimitWei;  // cumulative cap on native value
    address[] targets;        // exact allowlist, 1..32, never the account
    bytes4[]  selectors;      // exact allowlist, 1..32, no transfer selectors
}
```

The account stores `keccak256(abi.encode(spec))` and the full spec is re-presented on every call, so **a granted session's scope is immutable for its lifetime.** Full `abi.encode`, never packed — packed encoding of dynamic arrays is exactly the sort of thing that agrees on the happy path and diverges on the one input that matters.

Five rules, each enforced on chain on every call:

1. **Expiry is mandatory.** `validUntil` must be in the future and at most `MAX_SESSION_DURATION` (30 days) away. There is no permanent grant. The window is also handed to the EntryPoint as ERC-4337 validation data, so a stale operation is rejected before it reaches the account.
2. **Targets are an exact allowlist and can never include the account itself.** This single rule closes every escalation path at once: a session that cannot call its own account cannot grant itself a wider session, rotate the owner, or revoke the user's control.
3. **Selectors are an exact allowlist, and transfer selectors are refused at grant time.** `transfer`, `transferFrom`, `approve`, `increaseAllowance`, `permit`, `setApprovalForAll`, all three `safeTransferFrom` shapes, `safeBatchTransferFrom`, Permit2 `approve`, `transferOwnership`, `upgradeTo`, `upgradeToAndCall`. Not "is not issued" — **cannot be constructed**: `assertGrantable` reverts, and so does `createSessionSpec` in TypeScript. Re-checked at execution time as well. A zero selector (raw fallback call) is refused too, as is a call with no calldata: a bare native transfer is a payment, not a scoped call.
4. **Native value is capped cumulatively**, counted before the external call so re-entrancy spends the budget once rather than once per re-entry.
5. **A session-signed user operation must route through `executeWithSession`.** `validateUserOp` refuses any other selector, which is what makes every guardrail above unavoidable rather than merely present.

What a session key is _for_: an agent (§19) calling `swap` or `placeOrder` on a venue the user allowlisted, using an allowance the **owner** set. It moves nothing itself and creates no allowance of its own. Worst case for a fully compromised session key is a bad trade on a venue the user chose, inside a spend cap the user set, until an expiry the user set — and the user can end it instantly with one call we cannot make for them.

### `AccountFactory.sol`

CREATE2 deployment of EIP-1167 clones. `getAddress(owner, userSalt)` answers before the account exists.

- **The salt commits to the owner:** `keccak256(abi.encode(owner, userSalt))`. Nobody can deploy an account they control at an address a user was shown and funded.
- **Anyone may deploy.** A relayer paying gas is doing bookkeeping, not granting itself anything.
- **The implementation is immutable and so is every clone.**

`src/accounts/address.ts` re-derives the same address in TypeScript, and its tests pin the exact byte constants against the assembly.

---

## Tests

`pnpm --filter @intafaced/svc-protocol test` — **127 tests, no database or chain required.**

| File                        | Covers                                                                                                                                                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accounts/address.test.ts`  | EIP-1167 creation code, CREATE2 derivation recomputed independently, a pinned address, owner/salt/implementation separation, malformed input, and the Solidity assembly constants                                                                                                         |
| `session/spec.test.ts`      | **every forbidden selector refused at construction**, self-target refused, expiry required and capped, allowlist rules, cumulative spend limits at the boundary, abi round-trip and commitment stability, plus assertions that `SessionKeyLib.sol` hard-codes the same selectors and caps |
| `chain/userop.test.ts`      | ERC-4337 v0.7 packing, hash determinism, and that the hash binds chain, entry point, calldata and nonce while excluding the signature                                                                                                                                                     |
| `accounts/registry.test.ts` | claim requires the derived address AND an owner signature; refuses impostors, cross-user replay, and profile transfer; idempotent re-claim                                                                                                                                                |
| `sovereignty.test.ts`       | **§22 from this side** — `allowed.permissionless` for every region and every tier, `denied.plane_unsupported` on the fiat plane, a custodial control that must still be gated, and the §16.10 custody assertions listed under **Ledger**                                                  |

The Solidity/TypeScript cross-checks in the first two files deserve a note: with no compiler in the loop, they are what stops the two languages diverging. They assert that the exact selector constants, the 30-day cap, the list caps, and the EIP-1167 byte constants appear verbatim in the `.sol` sources. A change to one side without the other fails the suite.

### Not covered — §13 sockets

Contract behaviour is **not executed** by any test, because there is no Solidity toolchain in this repo and adding one was out of scope for this feature. Recorded as tracker sockets:

| Socket                            | What lands with it                                                                                                                                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `socket.contract-toolchain`       | Foundry, compilation in CI, and the contract suite: session-key escalation attempts, spend-limit re-entrancy, `validateUserOp` rejecting a session op that is not `executeWithSession`, clone address equality against `AccountFactory.getAddress`, gas snapshots |
| `socket.userop-differential-test` | `getUserOperationHash` checked against a live EntryPoint's `getUserOpHash`                                                                                                                                                                                        |
| `socket.p256-verifier`            | Passkey (P-256) owners end to end. The ERC-1271 path in `SmartAccount` already accepts a contract owner                                                                                                                                                           |
| `socket.social-recovery`          | Deliberately absent. A guardian set is a second party who can take the account, and the platform must never be one — the design needs its own review                                                                                                              |
| `socket.contract-audit`           | External audit before any mainnet deployment. Nothing in this suite has been audited                                                                                                                                                                              |

**Nothing in `contracts/` should be deployed to a chain holding real value until `socket.contract-toolchain` and `socket.contract-audit` are closed.**

---

## Kill-switch

`protocol.smartAccounts` in the admin console, or `PROTOCOL_RELAY_ENABLED=false`.

**Effect when off:** `relayUserOperation` refuses. Reads, address prediction and calldata construction continue.

Note what a kill-switch can and cannot do on this plane. It stops _us_ relaying. It does not stop a user transacting: their account is on a public chain and the same signed operation goes to any bundler. **A kill-switch here is a switch on our convenience, never on their access.** A kill-switch that could freeze a user's funds would mean we had custody, and this document would be a lie.

---

## Running it

```bash
docker compose up -d
pnpm --filter @intafaced/svc-protocol db:migrate    # runs as svc_protocol, which owns the schema
pnpm --filter @intafaced/svc-protocol test
pnpm --filter @intafaced/svc-protocol dev
```

Configuration lives in `src/env.ts`: chain id, RPC, EntryPoint, factory, implementation, and an optional bundler URL. A missing bundler degrades convenience, never access — the user submits the operation themselves. There is no key to configure, and there never should be.

## AMM (`protocol.amm`)

Constant-product pools under `contracts/amm/`. Permissionless tRPC: `amm.quoteExactIn`, `amm.buildCreatePool`, `amm.buildSwapExactIn`, `amm.buildMintLiquidity`. Platform never holds LP keys. Factory address: `PROTOCOL_AMM_FACTORY_ADDRESS`.
