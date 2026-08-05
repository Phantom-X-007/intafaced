# SPEC — EIP-155 chain id on the wallet RPC withdrawal signing path

> **STATUS: SPECIFIED, NOT APPLIED. The defect described here is still live on `main`.**
> Nothing in this document has been compiled, run or tested. There is no JDK, JRE or
> Maven on the host this was written on, and no Java in this repository has ever been
> built. This is a work order for someone with a toolchain, not a change log.

**Raised by:** `fix/wallet-rpc-criticals`, which fixed the other two `01_wallet_rpc`
criticals and deliberately left this one alone.
**Companion:** [`OWNER-ACTIONS-WALLET-RPC-SECRETS.md`](OWNER-ACTIONS-WALLET-RPC-SECRETS.md) §A4 ·
[`A1.4-WALLET-SECRETS-PERIMETER-2026-07-30.md`](A1.4-WALLET-SECRETS-PERIMETER-2026-07-30.md)
**Enforced by:** `tooling/ci/wallet-rpc-mainnet-scan.mjs` rule M3.

---

## 1. The defect

Both ETH-family withdrawal paths sign with the two-argument form of web3j's
transaction encoder:

| Where                                           | Method          | Moves                                              |
| ----------------------------------------------- | --------------- | -------------------------------------------------- |
| `eth-support/…/service/PaymentHandler.java:158` | `transferEth`   | native ETH                                         |
| `eth-support/…/service/PaymentHandler.java:193` | `transferToken` | any ERC-20, incl. the module's configured contract |

```java
byte[] signedMessage = TransactionEncoder.signMessage(rawTransaction, payment.getCredentials());
```

That overload takes **no chain id**. It is the pre-EIP-155 encoding, and the
signature it produces is valid on **every EVM chain at once** — Ethereum mainnet
included, whatever `coin.rpc` points at.

The consequence is the one that matters for containment, and it survives the
other two fixes on this branch:

> A withdrawal signed against a testnet node is **also a valid mainnet
> transaction**. Anyone who observes it — a node operator, a mempool watcher,
> anyone who can read the testnet — can replay those exact bytes onto mainnet
> and it will execute, from the same account, for the same amount, to the same
> destination.

Deleting the second Etherscan broadcast (done on this branch) removed the path
that broadcast the mainnet copy _for_ you. It did not make the signature
chain-specific. **"Point it at a testnet" is still not a containment strategy for
this tree.**

### Blast radius

`eth-support` is a library, not a service. Its `pom.xml` is a dependency of three
bootable modules, and both signing call sites are on the shared path:

- `eth` — native ETH withdrawals
- `erc-token`
- `erc-eusdt` — the module whose contract pin was the third critical

One fix in one file covers all three. That is also why a mistake in it costs
three modules.

---

## 2. Why this is not applied in the same branch as the other two

The other two criticals were a **deletion** and a **configuration value**.
Neither can change the bytes of a signed transaction:

- removing a second, redundant broadcast of already-signed bytes cannot alter how
  those bytes were produced;
- replacing a literal in a `.properties` file with an unresolved `${…}` placeholder
  removes a value, and the service refuses to start rather than using a different one.

This one is different in kind. **Adding a chain id changes what gets hashed and
therefore what gets signed.** EIP-155 changes the RLP payload the signature is
computed over and folds the chain id into `v`. Get it wrong and you do not get a
compile error or a test failure — you get a transaction that a node rejects as
malformed, or worse, one that is silently signed for a chain nobody meant.

On a withdrawal path, applying that without a compiler, without a single test,
and without a known-answer fixture, is exactly the class of change that looks
obviously right in review and strands money. **The correct action with no
toolchain is to specify it precisely and stop.** That is what follows.

---

## 3. MUST VERIFY FIRST — the chain-id parameter width

This reactor pins **web3j 3.3.1** (`01_wallet_rpc/pom.xml`, `org.web3j:core`).

In the web3j 3.x line the EIP-155 overload is believed to be:

```java
TransactionEncoder.signMessage(RawTransaction, byte chainId, Credentials)
```

— that is, the chain id is a **`byte`**, not a `long`. If that is correct, it is
decisive and it is the reason this document leads with it:

- a signed Java `byte` is `-128..127`;
- **Ethereum mainnet is chain id 1** — expressible;
- **Sepolia is 11155111** — NOT expressible;
- **Holesky is 17000, Polygon 137, Arbitrum 42161** — none expressible.

If that signature is what the resolved jar carries, then "add a chain id" cannot
be implemented for most of the chains anyone would actually want to contain this
tree on, and the real work order is **upgrade web3j first** (the parameter widened
to `long` in the 4.x line) — a dependency bump on unreviewed, unbuilt,
custody-holding third-party code, which is a much larger change than this one and
needs its own review.

**Verify before writing any code**, with a toolchain:

```bash
mvn -q dependency:copy-dependencies -DincludeArtifactIds=core
javap -classpath target/dependency/core-3.3.1.jar org.web3j.crypto.TransactionEncoder
javap -classpath target/dependency/core-3.3.1.jar org.web3j.tx.ChainId
```

Record the actual signature in this document before proceeding. Do not take the
paragraph above as established — it is knowledge of the library, not an
observation of the jar, and this repository has no way to check it.

---

## 4. The chain-id source

**It must be configuration, and it must have no default.**

Not a constant, not `1`, not "mainnet because that is what it does today". A
default of `1` would be mainnet-by-omission, which is the precise failure this
whole perimeter exists to prevent: a service that reaches mainnet because nobody
set a variable.

This matches what the auth/secrets work already established across all 13
property files — an unresolved `${…}` placeholder makes the service **fail to
start**, and a service that does not boot is strictly better than one that boots
pointed at the wrong chain.

**Add to `Coin` (`rpc-common/…/entity/Coin.java`, a lombok `@Data` bean bound by
`@ConfigurationProperties(prefix = "coin")` in `rpc-common/…/config/CoinConfig.java`):**

```java
    /**
     * EIP-155 chain id. NO DEFAULT: an unset value must stop the service, not
     * silently select a chain. See docs/SPEC-EIP155-WALLET-RPC-WITHDRAWAL-SIGNING.md.
     */
    private Long chainId;
```

Note the type is `Long` here and not `byte` regardless of what §3 finds — the
config should carry the true value, and any narrowing belongs at the call site
where it can be range-checked and rejected loudly.

`Coin` is **shared** by every module in the tree via `rpc-common`, so this field
appears on modules that have no use for it (`bch`, `ltc`, `xmr`, …). That is
harmless — those modules also carry their own `Coin.java` copies — but it should
be stated in the PR rather than discovered.

**And to `eth`, `erc-token` and `erc-eusdt` `application.properties`:**

```properties
# EIP-155 chain id. Environment only, no default: an unset value must stop the
# service rather than let it sign a transaction that is valid on every chain.
coin.chain-id=${ETH_CHAIN_ID}
```

plus a commented `# ETH_CHAIN_ID=` entry in `.env.example` under the
`01_wallet_rpc` block, alongside the existing wallet variables.

---

## 5. The exact diff

Assuming §3 confirms the `byte` parameter. **Both hunks are in the `eth-support`
module, `src/main/java/…/wallet/service/PaymentHandler.java`** — the package
segment is elided because the vendor's identity may not be written into this
repo's own source (Doctrine §0.7), which is also why the mainnet gate keys its
baseline by module and file basename rather than by path.

A range check is included deliberately: with a `byte` parameter, a chain id of
`137` silently truncates to `-119`, which is a _different chain id_ and a
perfectly valid signature for nothing. It must throw, not truncate.

```diff
@@ transferEth(Payment payment)
-            byte[] signedMessage = TransactionEncoder.signMessage(rawTransaction, payment.getCredentials());
+            byte[] signedMessage = TransactionEncoder.signMessage(rawTransaction, chainIdByte(), payment.getCredentials());

@@ transferToken(Payment payment)
-            byte[] signedMessage = TransactionEncoder.signMessage(rawTransaction, payment.getCredentials());
+            byte[] signedMessage = TransactionEncoder.signMessage(rawTransaction, chainIdByte(), payment.getCredentials());

@@ new private helper on PaymentHandler
+    /**
+     * The configured EIP-155 chain id, narrowed to the width web3j 3.3.1 accepts.
+     *
+     * Fails loudly in both directions rather than guessing. An unset chain id is
+     * a configuration error, and a chain id that does not fit in a signed byte is
+     * a library limitation the operator has to know about — truncating it would
+     * produce a valid signature for a chain nobody chose.
+     */
+    private byte chainIdByte() {
+        Long id = coin.getChainId();
+        if (id == null) {
+            throw new IllegalStateException(
+                "coin.chain-id is not set. Refusing to sign: the two-argument signMessage is pre-EIP-155 "
+                    + "and produces a transaction that is replay-valid on every EVM chain, mainnet included.");
+        }
+        if (id < 1 || id > Byte.MAX_VALUE) {
+            throw new IllegalStateException(
+                "coin.chain-id=" + id + " does not fit the byte-width chain id of web3j 3.3.1. "
+                    + "Upgrade web3j before targeting this chain - see docs/SPEC-EIP155-WALLET-RPC-WITHDRAWAL-SIGNING.md.");
+        }
+        return id.byteValue();
+    }
```

`coin` is already an `@Autowired` field on `PaymentHandler`, so no new injection
is needed.

**If §3 instead finds a `long` parameter** (i.e. the resolved jar is not what is
assumed), the helper collapses to a null check and the range check is dropped —
but the null check stays, because "no chain id configured" must never mean
"sign for chain 0", which is `ChainId.NONE` and is exactly the defect being fixed.

### What must NOT be written

```java
// WRONG. Compiles, passes the gate's old arity rule, and changes nothing:
TransactionEncoder.signMessage(rawTransaction, ChainId.NONE, payment.getCredentials());
```

`ChainId.NONE` is web3j's literal "no chain id" sentinel (`0`). The three-argument
call with `NONE` produces a **byte-identical** pre-EIP-155 signature. This is the
most likely wrong fix, because it is the named constant already on the classpath
and it makes the call _look_ remediated.

Rule M3 of `wallet-rpc-mainnet-scan.mjs` was widened on this branch to catch it,
along with the two-argument `RawTransactionManager` and `Transfer.sendFunds`,
both of which sign chain-id-less on web3j 3.x without the word `signMessage`
appearing anywhere. All are mutation-proved.

---

## 6. What must be true before this is trusted

None of this is optional, and none of it can be done here.

1. **It compiles.** `mvn -pl eth-support -am compile` against a real JDK 8. The
   reactor currently declares a module that is absent from disk, so `mvn` cannot
   resolve the build at all — that has to be sorted first, and it is its own task.
2. **§3 is answered from the jar**, not from memory, and this document is updated
   with the observed signature.
3. **A known-answer signed-transaction fixture test exists and passes.** This is
   the one that actually matters, and the reason a compiler alone is not enough:

   - take a fixed private key, nonce, gas price, gas limit, recipient and value;
   - sign with the new code at a known chain id;
   - assert the resulting hex **equals a vector produced independently** — from
     ethers.js, from `eth_signTransaction` on a local devnet, or from the EIP-155
     test vectors — not from a second run of the same code;
   - assert `v` is `chainId * 2 + 35` or `chainId * 2 + 36`, which is the whole
     observable point of EIP-155;
   - assert the OLD two-argument output does **not** equal the new output, so the
     test proves the change took effect rather than passing vacuously.

4. **A negative test**: with `coin.chain-id` unset, `transferEth` and
   `transferToken` throw and no transaction is broadcast. Not "logs a warning".
5. **A replay test, if a devnet is available**: the new signed transaction is
   rejected when submitted to a node running a different chain id. That is the
   property being bought; assert it directly rather than inferring it.
6. **The gate stays green.** `pnpm gates` must pass, and the M3 frozen entry in
   `tooling/ci/wallet-rpc-mainnet-scan.mjs` must be **deleted in the same commit**
   — the baseline is a ratchet that can only shrink, and a fixed finding that is
   still listed will fail as stale. Its `occurrences: 2` is what currently pins
   both call sites.

---

## 7. Priority, in context

This is **not** the most urgent item on this tree, and it should not jump the queue
ahead of the review §A4 requires.

Nothing in this repository can build, containerise, compose or boot any module of
`01_wallet_rpc` — that is an enforced invariant (rules M5, M6 and M7), not an
accident, and it is asserted on every CI run. So this defect is **latent**: it is
a property of code that nothing here can execute. The order is:

1. the security review the vendored-exchange ADR makes a precondition of adoption;
2. a JDK and a working reactor build;
3. this fix, with the fixture tests above;
4. only then, any question of deployment.

Applying step 3 before step 2 is what this document exists to prevent.
