# A local dev chain is not a chain decision

**Date:** 2026-07-30 · **Stream B (Denon)** · `feat/spine-local-evm`

`protocol.smart-accounts` carried 27 transitive unlocks and was gated on exactly
one thing: **there was no EVM RPC anywhere in this environment.** `svc-indexer`
booted on `NullChainSource`, `PROTOCOL_FACTORY_ADDRESS` and
`PROTOCOL_IMPLEMENTATION_ADDRESS` defaulted to `0x0`, and every chain-dependent
path refused. Correctly — but nothing had ever returned a value.

This change puts a chain in the compose stack so those paths can. It does **not**
choose a chain for the product.

---

## What was decided

### 1. Anvil, in `docker-compose.yml`, marked `# no-deploy`

Foundry's `anvil`, pinned at `ghcr.io/foundry-rs/foundry:v1.5.1`, on 8545,
labelled `com.intafaced.deploy: never`, with **no volume**.

The missing volume is deliberate. State is ephemeral, so every start is genesis,
so the deployer is at nonce 0, so `chain:deploy` lands the suite at the same two
CREATE addresses every time. That determinism is what lets
`docker-compose.apps.yml` name real addresses as defaults instead of asking each
developer to copy hex out of a terminal. Persisting the chain would trade that
away for nothing anybody asked for.

**Rejected:** a compose `profile`. A flag you can forget is a partial platform
with no error — the same argument `docker-compose.apps.yml` already makes in its
own header about why apps live in a second file rather than behind `--profile`.

### 2. `solc` from npm, not Foundry or Hardhat, as the compiler

`socket.contract-toolchain` said the Solidity had never been executed. It turned
out never to have been **compiled**.

`solc` is the compiler itself, published to npm as the emscripten build the
Solidity team release alongside every native binary. Pinning it as a
devDependency means every machine and every CI runner produce identical
bytecode; `forge build` downloads a solc into a user-level cache at first use,
which is a version nobody reviews. It also needs no Rust toolchain, no
`foundry.toml`, no submodules, and it works on Windows, which is where this repo
is developed.

Anvil is still the chain. Compiling and running are separate jobs on purpose, so
the local chain can be swapped without touching how contracts are built.

Artefacts are **committed** under `services/svc-protocol/contracts/out/` (the
blanket `out/` gitignore rule needed a negation). Committed output is only
trustworthy if it can be checked, so each artefact carries a `sourceHash` over
the compilation input that the test suite re-derives from the `.sol` files on
disk. `evmVersion` is pinned to `paris`: no PUSH0, so this bytecode runs on
chains that have not adopted Shanghai. A dev chain does not get to make that
call for production.

### 3. Configured is not deployed

Naming real addresses in compose created a way for the service to claim
contracts that are not there — precisely the dishonesty the typed refusals
(#193) removed. So `chainStatus` now splits the question:

| field             | means                                                     |
| ----------------- | --------------------------------------------------------- |
| `suiteConfigured` | both addresses are non-zero. Config, not evidence.        |
| `suiteDeployed`   | **`eth_getCode` says both hold code.** Read, every probe. |
| `usable`          | `reachable && suiteDeployed`                              |

`suiteDeployed` is `false` whenever the chain could not be reached, because an
unverifiable claim is not a true one.

---

## What this does **not** decide

- **No production chain.** No network chosen, no deployment key, no deployment
  record, no verified sources. That is a key-custody decision a human makes once
  with a key this repository has never held.
- **Nothing is audited.** `socket.contract-audit` is untouched. A local chain
  proves these contracts compile and behave as documented; it says nothing about
  whether they are safe.
- **No EntryPoint and no bundler.** The ERC-4337 v0.7 EntryPoint is a public
  singleton we do not own and it is not in this repository, so
  `relayUserOperation` still refuses locally with `relay.bundler_unavailable`.
  That is the honest state, and it is asserted as a test so nobody discovers it
  by surprise.
- **`socket.evm-rpc` stays open.** `svc-indexer` still boots `NullChainSource`.
  Its socket is blocked on there being a deployed **CLOB** to read, which this
  does not provide.

---

## What was proven, and what it protects against

**The CREATE2 cross-check.** `accounts/address.ts` derives an account address in
TypeScript; `AccountFactory.getAddress` derives it in hand-written EVM assembly.
Until now the second had never been executed, so nothing had confirmed they
agree. If they disagree, a user is shown an address during onboarding, funds it
before deployment — which is the entire point of §17.4 — and the factory later
deploys their account somewhere else. Nothing is stolen. The money is simply at
an address with no code and no owner, permanently.

They agree, across 25 owner/salt pairs, against the deployed factory. The
account also lands at the predicted address, is owned by the user rather than by
the relayer who paid for it, and its runtime code is byte-identical to the
EIP-1167 proxy the init code hashes.

**The hand-written ABI.** `chain/abi.ts` was written by hand because there was
no compiler. It is now checked against the compiled ABI — inputs, outputs,
`stateMutability`, `indexed` flags. It agreed exactly. Worth keeping as a gate: a
wrong output type there does not throw, it makes viem decode the same bytes into
a different value, and a session's `validUntil` or `spentWei` comes back wrong
with full confidence.

**The refusals still hold.** `chain/refusal-without-chain.test.ts` points the
real `ProtocolChain` at a real closed socket. It runs with no chain, by design —
if the dev node ever became something the service quietly needs, this fails.

---

## Two bugs the chain surfaced

1. **`ConstantProductPool` does not compile, and never has.** `swapExactIn`
   calls `swap` at lines 177 and 179; `swap` is `external`, which Solidity does
   not permit to be called internally. The AMM pool has never produced bytecode
   and is undeployable. **Not fixed here** — it changes a money contract's
   external surface and belongs to `protocol.amm`. It is pinned as a
   known-broken suite in `scripts/contract-sources.mjs`, so the build fails if it
   starts compiling, or fails differently, without somebody deciding.

2. **`relayUserOperation` returned an opaque 500 for a malformed signature
   envelope.** `SignatureEnvelopeError` was unmapped in `toTrpcError`, so a
   caller's own wrong-shaped bytes arrived as
   `INTERNAL_SERVER_ERROR: 'Protocol request failed'` — a retry invitation for
   an operation that can never be accepted. Now a 400. Only reachable once there
   was a chain to get past the first read.

---

## CI

The test job starts anvil with `docker run` (GitHub gives service containers no
way to pass a command, and the foundry image's entrypoint needs one) and sets
`REQUIRE_EVM_CHAIN=1`. That mirrors `REQUIRE_POSTGRES`: the suite may skip on a
laptop with no chain, and must never skip on CI. A silent skip is how "we proved
CREATE2 agrees" quietly stops being true.
