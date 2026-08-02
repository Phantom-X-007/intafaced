# OWNER ACTIONS — wallet RPC secrets

**Date:** 2026-08-02. **Raised by:** the `fix/wallet-rpc-auth` branch.
**Companion:** [`A1.4-WALLET-SECRETS-PERIMETER-2026-07-30.md`](A1.4-WALLET-SECRETS-PERIMETER-2026-07-30.md) §2, §4, §5.

Everything on this page needs a **human with authority over a chain account or a
third-party account**. None of it can be done by an agent, and none of it was attempted.

**No secret value appears in this document.** Items are referenced by file and key.

---

## Why these are yours and not the branch's

A committed secret has two halves. **Getting it out of the code path** is an engineering
change and it is done — the values now come from the environment, and the services refuse
to start without them. **Making the old value worthless** is a rotation, and rotation is an
act on a live system: it needs a wallet, a signature, or a vendor console login.

The thing that makes rotation non-optional here is that a committed secret is **disclosed
forever by git history**. Rewriting history does not help — the objects exist in every
clone, every fork, and every backup. The only remedy that works is to make the value
useless.

An agent must not rotate these, must not invent replacements, and must not "temporarily"
generate one to make a service boot. A key that an agent generated is a key an agent had.

---

## A1 — ECT withdrawal signing secret · **do this first**

|              |                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Where**    | `01_wallet_rpc/ect/src/main/resources/application.properties` → `coin.withdraw-wallet` (before this branch; now `${ECT_WITHDRAW_WALLET_SECRET}`) |
| **What**     | The seed that signs every ECT withdrawal. Correct Ripple-family format.                                                                          |
| **Reaches**  | `WalletController.withdraw` → `EctApi.sendFrom` → POSTed as the JSON `secret` field to `coin.rpc`, **in cleartext over plain HTTP**.             |
| **Controls** | Everything at `coin.withdraw-address`.                                                                                                           |
| **Status**   | Disclosed. Assume every holder of a repo clone has it.                                                                                           |

**Remediation, in order:**

1. **Check the balance at `coin.withdraw-address`** (the address is in the same properties
   file and is public). If it is non-zero, this is an incident, not a chore.
2. **Sweep any balance to a new address** whose key was generated **off this machine and
   outside this repository**, before doing anything else.
3. **Generate the replacement secret outside the repo.** Never paste it into a file in the
   tree, a commit message, a PR body, or a chat.
4. **Set `ECT_WITHDRAW_WALLET_SECRET`** in the deployment environment only.
5. **Decide whether `coin.rpc` stays plain HTTP.** Today the secret is POSTed unencrypted.
   Rotating the key while continuing to send the new one in cleartext buys one round.
   Either terminate TLS in front of the node or keep the whole path on a private network.

**Already done for you, so you do not have to sequence it:** `EctWithdrawSecretConfig`
refuses to start if the variable is unset, **and refuses to start if it is set to the old
disclosed value** (matched by SHA-256, so the value itself is not in the tree). The likely
mistake — copying the old literal out of git history to make the service boot again — is
blocked.

---

## A2 — second ECT secret, in a deleted `main()`

|             |                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Where**   | `01_wallet_rpc/ect/…/component/EctApi.java` — `main()`, **now deleted**                                                                                |
| **What**    | A _different_ hard-coded wallet secret, plus a source account, in a developer scratch harness that shipped.                                            |
| **Reaches** | It called `sendFrom` directly — a signed 10-ECT transfer against a hard-coded third-party IP. The only thing stopping it was nobody running the class. |
| **Status**  | Disclosed. Separate from A1: **rotating A1 does not cover this account.**                                                                              |

**Remediation:** same shape as A1 — check the source account named in that method (recover
it from git history if needed), sweep anything it holds, and treat the key as burned. There
is no environment variable to set: the code path is gone, not relocated.

---

## A3 — ACT node RPC credential · decision, not necessarily action

|            |                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------ |
| **Where**  | `01_wallet_rpc/act/src/test/java/ActClientTest.java`                                             |
| **What**   | `http://<user>:<weak-password>@<public-ip>:8900/rpc` inline in a `main()`.                       |
| **Status** | Almost certainly upstream's node, not ours. Not run by surefire — it is a `main`, not a `@Test`. |

**Deliberately left in the tree.** Deleting the line changes nothing: it is in history either
way, and it is not on any code path. The only question is whether that node is ours, which
only you can answer. If it is: rotate it. If it is not: nothing to do, and it stays as
evidence of what this vendored tree ships with.

---

## A4 — do not deploy `01_wallet_rpc` against real value yet

Not a secret, but it belongs on this page because it is the constraint the rest sits under.

The [vendored-exchange ADR](adr/2026-07-28-vendored-exchange-integration.md) makes a
security review a **precondition of adoption**, and that review has not happened: 878 Java
files, 31 unverifiable committed `.jar` binaries on the classpath of services that hold
custody, and no JDK on this host, so **none of this has ever been compiled or run.**

The `fix/wallet-rpc-auth` branch closed one specific hole found in passing — six modules
serving withdrawal endpoints with no authentication. **It is not that review, and it should
not be read as clearance.** Treat every module in `01_wallet_rpc` as untrusted until
somebody has read it.

---

## What is already enforced, so you do not have to remember it

| Guard                                                                          | Effect                                                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `RpcSecurityConfig` in all 13 bootable modules                                 | No `WALLET_RPC_AUTH_TOKEN` (or one under 32 chars) → the service **does not start**.                    |
| `EctWithdrawSecretConfig`                                                      | No `ECT_WITHDRAW_WALLET_SECRET`, or the old disclosed one → ECT **does not start**.                     |
| `tooling/ci/wallet-rpc-auth-scan.mjs` (wired into `pnpm gate` / `pnpm verify`) | A module that can boot without the guard on its classpath fails CI. So does an unread `rpc.auth-token`. |
| Same scan, rule W3                                                             | Any future compose entry publishing a `01_wallet_rpc` port off `127.0.0.1` fails CI.                    |
| `tooling/ci/secret-scan.mjs`                                                   | `withdraw-wallet` keys must be `${VAR}` or a keystore filename. The ECT literal now fails the gate.     |

Nothing in `01_wallet_rpc` publishes a port today — no compose file defines one of these
services at all. W3 exists so that stays true by accident-proofing rather than by memory.
