# Smart accounts — adversarial audit package (S-A1 skeleton)

**Status:** **Open / not audited.** This file is the package shape required by board S-A1 and `socket.contract-audit`. It is **not** permission to set `audited:true` anywhere.  
**Scope:** `SmartAccount.sol`, `AccountFactory.sol`, `SessionKeyLib.sol`, `PasskeyOwner.sol` / `P256.sol` (S-A9).  
**Owner:** `@shehzad002`. External firm engagement is a **Nitro budget** decision (§0.5).  
**Date opened:** 2026-08-08.

---

## 1 · Threat model (what we claim the code forbids)

| Adversary                   | Goal                                     | Architectural refusal                                                                              |
| --------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Platform / operator         | Move user funds without a user signature | No admin, pause, upgrade, or guardian on `SmartAccount`; EIP-1167 clone → immutable implementation |
| Malicious bundler / relayer | Swap callData after signature            | ERC-4337 userOpHash binds callData; session keys cannot target the account or widen scope          |
| Session key thief           | Drain beyond grant                       | Selectors/targets/spend limit enforced; epoch panic button                                         |
| Passkey assertion reuse     | Authorise a different userOp             | `PasskeyOwner` binds WebAuthn `challenge` to the digest under check                                |
| Signature malleability      | Replay alternate (r,s)                   | secp256k1 half-n in SmartAccount; P-256 half-n in `P256.sol`                                       |
| Missing P-256 precompile    | Silent accept                            | `P256.verify` reverts / ERC-1271 returns fail — never invents success                              |

**Out of scope for this package (named sockets):** social recovery (`socket.social-recovery` / S-K7 before S-L2), paymaster funding (S-A10), bundler policy (S-A11), EntryPoint differential (S-A11 / `socket.userop-differential-test`), deployment registry (S-A13).

---

## 2 · Findings log

| ID  | Severity | Status | Summary                                                                     |
| --- | -------- | ------ | --------------------------------------------------------------------------- |
| —   | —        | —      | No external audit yet. Unit + on-chain suites exist; they are not an audit. |

When a finding lands: add a row, link the PR that fixed it or the residual that owns it, never delete history.

---

## 3 · Proof already on tip (do not rebuild)

- Smart account suite compiles (solc 0.8.28); CREATE2 TypeScript ↔ factory cross-check (#210).
- AMM mint/`swapExactIn` on a real chain (#288); token factory E2E (#217).
- **S-A9:** `PasskeyOwner` + RIP-7212 path; hermetic WebAuthn bridge tests aligned with `svc-identity`.

---

## 4 · Residuals before any `audited:true`

1. External review (or explicit Nitro deferral → keep socket).
2. Fuzz / invariant suite (`socket.contract-toolchain` residual).
3. Live EntryPoint hash differential.
4. Gas snapshot on the **ruled** P0 rail (S-D1) for `PasskeyOwner.isValidSignature`.
5. Origin/rpId on-chain binding (today origin is enrolment-time off-chain only — named in PasskeyOwner NatSpec).

---

## 5 · How to close this package

- Findings empty or all fixed/residual-owned.
- Artefact hash of reviewed bytecode recorded.
- Signer / firm named.
- Tracker `socket.contract-audit` moves only with that evidence — never with "tests pass."
