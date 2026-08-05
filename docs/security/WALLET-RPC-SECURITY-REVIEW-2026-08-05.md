# Security review — `vendor/upstream-exchange/01_wallet_rpc`

**Date:** 2026-08-05
**Scope:** the vendored wallet RPC tree, 16 module directories, 228 tracked `.java` files, 13 `.properties`, 18 committed `.jar` binaries.
**Method:** static reading only. Nothing in this review was compiled, executed, or tested.
**Status of the tree:** unreviewed until this document. This document is that review.

This is the read that [`docs/UPSTREAM-ADOPTION-QUEUE-2026-08-02.md:1488`](../UPSTREAM-ADOPTION-QUEUE-2026-08-02.md) deferred when it said _"It is not a security review and must not be cited as one. 215 files were not read line by line."_ It is the precondition of adoption that the [vendored-exchange ADR](../adr/2026-07-28-vendored-exchange-integration.md) requires, and that [`OWNER-ACTIONS-WALLET-RPC-SECRETS.md` §A4](../OWNER-ACTIONS-WALLET-RPC-SECRETS.md) records as not having happened.

**Verdict up front:** this tree must not be pointed at real value in its current state, and the reason is not the three findings that were already known. It is that **two of its thirteen bootable services print a live spending credential to stdout on an ordinary success path**, and a third almost certainly prints an Ethereum private key. Those are not configuration mistakes; they are code. See [Verdict](#verdict).

---

## 1. Scope and method

### 1.1 What was read

Every `.java` file under `vendor/upstream-exchange/01_wallet_rpc`, every `pom.xml`, every `application.properties`, and the file listing and reference graph of every committed `.jar`.

The six bitcoinj-family modules (`bch`, `bsv`, `ltc`, `btm`, `eos`, `xmr`) are near-identical clones. `bch` was read in full and the other five were diffed against it, with every differing region read in full. That is stated here so the claim "228 files read" is not mistaken for 228 independent readings — roughly 90 of those files are byte-identical copies of about 20 distinct files.

### 1.2 What could **not** be done, and why

**There is no JDK, JRE, or Maven on this host.** Nothing here was compiled, run, unit-tested, fuzzed, or dynamically observed. Every finding in this document is a static-analysis finding and is marked as such. Specifically, this review could not:

| Not done                         | Consequence for this review                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Compile any module               | Cannot confirm the tree even builds. It almost certainly does not — see [F21](#f21).                                                                                                                               |
| Run `mvn dependency:tree`        | The transitive dependency set, and therefore the CVE surface and the gadget classes available to a deserialisation attack, is **unknown**. Only directly declared versions are reported here.                      |
| Resolve any Maven coordinate     | Cannot confirm that `cash.bitcoinj:bitcoinj-core:0.14.5.2`, `org.web3j:core:3.3.1` or any other declared dependency resolves to a public artifact, nor what its checksum is.                                       |
| Open `org.web3j:core:3.3.1`      | The `Credentials` / `ECKeyPair` accessor chain that [F4](#f4) depends on was reasoned about from the library's published API, not read. Flagged inline.                                                            |
| Execute a fastjson serialisation | [F4](#f4) depends on fastjson's `JavaBeanSerializer` walking public getters. That is fastjson's documented behaviour, not an observation.                                                                          |
| Reach the network                | Cannot check any jar checksum against Maven Central, cannot verify the `47.74.42.87` node in [F19](#f19) is or is not ours, cannot check balances at any address named here.                                       |
| Read the deployed environment    | Every `${VAR}` placeholder's actual value is unknown. Whether one `WALLET_RPC_AUTH_TOKEN` is shared across all thirteen services — which decides the blast radius of [F5](#f5) — cannot be answered from the tree. |
| Read downstream consumers        | Whether re-emitted deposit events double-credit ([F17](#f17)) depends on a Kafka consumer outside this tree that was not reviewed.                                                                                 |

Where a finding rests on an inference rather than a read, the inference is named at the finding.

### 1.3 Live vs latent

Nothing in this tree runs today. There is **no Dockerfile anywhere in it, no compose service that references it, no CI job that builds it, and no shell script that starts it** — independently confirmed for this review, and now enforced by rules M5–M7 of `tooling/ci/wallet-rpc-mainnet-scan.mjs` (PR #763). So in the strictest sense every finding here is unreachable.

That reading is useless for a custody decision, so this review uses a narrower axis:

- **LIVE** — reachable on an ordinary code path the first time somebody supplies the environment variables and starts the service. The absence of a Dockerfile is one commit away from not being true, and the placeholders that stop a service from starting decide _whether_ it starts, not what it does once it has.
- **LATENT** — real code that is still not reachable when the service runs: dead methods with no callers, commented-out branches, paths masked by a mangled constant, or `main()` harnesses that no runtime invokes.

"LIVE" in this document therefore means _live the moment anyone deploys this tree_, which is exactly the decision this review exists to inform.

### 1.4 Ranking

Findings are ranked by **what an attacker gains**, not by CVSS. A finding that hands over a spending key outranks a finding with a higher nominal score that yields an error message.

---

## 2. Findings

### Summary table

| #           | Finding                                                                     | Live?                        | An attacker gains                                                   |
| ----------- | --------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------- |
| [F1](#f1)   | ECT withdrawal signing secret printed to stdout on every withdrawal         | LIVE                         | The entire ECT hot wallet, from log-read access                     |
| [F2](#f2)   | Node RPC credentials logged at INFO on startup (3 modules)                  | LIVE                         | Full spend authority over the BTC / Omni-USDT / ACT nodes           |
| [F3](#f3)   | ETH hot-wallet private key reachable by the payment-status logger           | LIVE                         | The ETH and ERC-20 hot wallet, from log-read access                 |
| [F4](#f4)   | Chain-id-less signing + unconditional second broadcast to mainnet Etherscan | LIVE                         | Withdrawals land on mainnet regardless of which node signed them    |
| [F5](#f5)   | Every value-moving endpoint is an HTTP GET behind one shared static token   | LIVE                         | The whole float, in one request, to any address                     |
| [F6](#f6)   | Deposits credited without checking transaction success                      | LIVE (eth) / LATENT (erc-\*) | Credit for transfers that never happened                            |
| [F7](#f7)   | No function-selector check in the token deposit watcher                     | LATENT                       | Credit for an `approve()` that moves nothing                        |
| [F8](#f8)   | Trust-all TLS feeding fastjson 1.2.31 in six key-handling services          | LIVE                         | Code execution in a process holding private keys                    |
| [F9](#f9)   | Unencrypted bitcoinj wallet, plus a race that silently destroys keys        | LIVE                         | Permanently unspendable customer deposits                           |
| [F10](#f10) | `act` cannot be shown to have the auth guard; the gate is version-blind     | LIVE                         | Unauthenticated `/rpc/**` on one service                            |
| [F11](#f11) | Depositor chooses which user account gets credited                          | LIVE (eos) / LATENT (xmr)    | Misattributed credit; no existence check on the target              |
| [F12](#f12) | `walletpassphrase` / `walletlock` are dead code across the tree             | LIVE                         | Node RPC reachability equals unlimited spend authority              |
| [F13](#f13) | Live mainnet Tether contract pinned, unmangled                              | LIVE                         | (known) The module addresses real USDT                              |
| [F14](#f14) | Service-registry beacon to a routable third-party IP                        | LIVE                         | The location of every process holding withdrawal keys               |
| [F15](#f15) | Raw node and exception text echoed to HTTP callers                          | LIVE                         | Node internals, RPC parameters, filesystem paths                    |
| [F16](#f16) | `erc-token` and `erc-eusdt` collide on port, coin name and collection       | LIVE                         | Address-book confusion between two contracts                        |
| [F17](#f17) | Unbounded block-replay endpoint re-emits deposit events                     | LIVE                         | Deposit-event flood; double-credit if consumers are not idempotent  |
| [F18](#f18) | Shared static HTTP client and response across threads                       | LIVE                         | Cross-request response confusion in a wallet service                |
| [F19](#f19) | Committed node credentials in `main()` harnesses                            | LATENT                       | Two disclosed node credentials                                      |
| [F20](#f20) | Locally rebuilt, unreferenced 1.4 MB crypto library                         | LATENT                       | An unverifiable binary one config line from the key-minting path    |
| [F21](#f21) | This tree has never been compiled by anyone                                 | LIVE                         | Nothing — it is why every judgement here is unchecked by a compiler |

---

<a id="f1"></a>

### F1 — The ECT withdrawal signing secret is printed to stdout on every withdrawal · **LIVE**

**Where:** `vendor/upstream-exchange/01_wallet_rpc/ect/src/main/java/…/component/EctApi.java:129` and `:141`

```java
126:    public String sendFrom(String privatekey, String from, String to, BigDecimal amount, String remark){
128:            JSONObject request = new JSONObject();
129:            request.put("secret", privatekey);
...
140:            request.put("payment", payment);
141:            System.out.println(request.toJSONString());
142:            HttpResponse<String> response = Unirest.post(host + "/accounts/payments/"+from+"?submit=true")
```

Line 129 puts the withdrawal signing secret into `request`. Line 141 serialises `request` — the whole object, secret included — and writes it to standard output. This happens on the success path of every single withdrawal, before the request is sent.

**Reached from:** `ect/.../controller/WalletController.java:47` — `ectApi.sendFrom(coin.getWithdrawWallet(), ...)`, where `coin.withdrawWallet` is bound from `ect/src/main/resources/application.properties:28` — `coin.withdraw-wallet=${ECT_WITHDRAW_WALLET_SECRET}`. This is item **A1** of `OWNER-ACTIONS-WALLET-RPC-SECRETS.md`, the secret that document tells the owner to rotate first.

**What an attacker gains:** everything at `coin.withdraw-address`. Not by breaking anything — by reading a log. In a container deployment, stdout is the log pipeline: `docker logs`, journald, whatever aggregator is attached, and every copy and backup of it. The guard that was built for this secret (`EctWithdrawSecretConfig`, which refuses to boot on a blank or known-disclosed value) protects _provisioning_. It does not protect the value once the process is running, and this line hands out the replacement secret exactly as freely as the old one.

**Adjacent, same file, same shape:** `EctApi.java:88` — `System.out.println(response.getBody())` inside `getNewWallet()`, whose response body _is_ a freshly minted address **and its secret**. That method has no caller in this tree, so it is latent — but the sink is unconditional, so the first caller added leaks every newly minted ECT wallet secret into the logs.

**Remediation direction:** delete the print at `:141` and `:88`; a secret must never reach a serialiser whose output goes to a log sink.

---

<a id="f2"></a>

### F2 — Node RPC credentials are logged at INFO on startup · **LIVE**

**Where, three modules, three separate lines:**

| File                                      | Line | Code                                   |
| ----------------------------------------- | ---- | -------------------------------------- |
| `bitcoin/.../config/RpcClientConfig.java` | 23   | `logger.info("uri={}",uri);`           |
| `usdt/.../config/RpcClientConfig.java`    | 23   | `logger.info("uri={}",uri);`           |
| `act/.../config/JsonrpcConfig.java`       | 17   | `System.out.println("coin.rpc="+url);` |

In all three the logged value is the injected `${coin.rpc}`, which by design carries HTTP basic-auth credentials in its userinfo — `bitcoin/src/main/resources/application.properties:26-28` documents it as _"bitcoind RPC endpoint including its rpcuser:rpcpassword"_. `act`'s own `JsonrpcClient.java:32` goes to the trouble of rebuilding the URI **without** the userinfo before putting it on the wire; `JsonrpcConfig.java:17` prints the original, with it, first.

**What an attacker gains:** a bitcoind or omnicore RPC credential is spend authority over that node's wallet. Combined with [F12](#f12) — nothing in this tree ever locks a node wallet — RPC reachability is unlimited spend authority. The ACT credential likewise controls the ACT node.

**Second-order, same beans:** `usdt/.../config/RpcClientConfig.java:26` — `logger.info("client={}",client)` — passes the client object, which holds the derived `Authorization: Basic …` header value, into a log statement. `JsonrpcClient` neither overrides `toString()` nor carries Lombok `@Data`, so this most likely resolves to the default `Object.toString()` and leaks nothing. **I could not confirm this**: the superclass `com.spark.blockchain.rpcclient.BitcoinRPCClient` lives in a committed jar and I have no JDK to decompile it. Treat as unresolved.

Same class of latent risk in `act/.../component/JsonrpcClient.java:21`, where Lombok `@Data` is applied to a class whose `headers` field holds the `Authorization` value — the generated `toString()` and `getHeaders()` will emit it. No current call site logs the object.

**Remediation direction:** log the scheme, host and port only; never the whole URL for any property that is documented as carrying credentials.

---

<a id="f3"></a>

### F3 — The ETH hot-wallet private key is reachable by the payment-status logger · **LIVE** · _inference, see caveat_

**Where:** `vendor/upstream-exchange/01_wallet_rpc/eth-support/src/main/java/…/service/PaymentHandler.java:207` and `:212`

```java
198:    @Scheduled(cron = "0/30 * * * * *")
199:    public synchronized void checkJob(){
202:        if (current != null ) {
206:                    if (ethService.isTransactionSuccess(current.getTxid())) {
207:                        logger.info("转账{}已成功,检查次数:{}", JSON.toJSON(current), checkTimes);
...
212:                        logger.info("转账{}未成功,检查次数:{}", JSON.toJSON(current), checkTimes);
```

`current` is a `Payment`. `Payment` has a public getter for its `Credentials`:

- `eth-support/.../entity/Payment.java:13` — `private Credentials credentials;`
- `eth-support/.../entity/Payment.java:28` — `public Credentials getCredentials() { return credentials; }`

`JSON.toJSON(Object)` (fastjson 1.2.31) serialises a POJO through `JavaBeanSerializer`, which walks public getters recursively. The web3j chain from there is `Credentials.getEcKeyPair()` → `ECKeyPair.getPrivateKey()`, which returns the secp256k1 private key as a `BigInteger`.

**The result is that the ETH hot-wallet private key is written to the log, as a decimal integer, every thirty seconds for as long as a withdrawal is unconfirmed** — and `maxCheckTimes` is 100 (`:62`), so up to fifty minutes of repetition per withdrawal.

**Caveat — this is an inference, not an observation.** `org.web3j:core:3.3.1` is a Maven dependency, not a jar in this tree, so I could not open it; the `getEcKeyPair()` / `getPrivateKey()` accessors are taken from web3j's published API for that generation. Likewise fastjson's getter-walking is documented behaviour I could not execute. Both would take about two minutes to confirm on a host with a JDK, and confirming them is the single highest-value follow-up in this document.

#### F3 follow-up, 2026-08-05 (PR "wallet RPC gate gaps") — half answered, and it stays an inference

This finding depends on **two** libraries. One of them turned out to be readable on this host after all; the other is not, and no JDK appeared. So the honest position is that the inference is now **shorter, not resolved**.

**Confirmed — fastjson serialises through public getters, and recurses.** `com.alibaba:fastjson:1.2.31` is present in the host's local Maven repository at `~/.m2/repository/com/alibaba/fastjson/1.2.31/fastjson-1.2.31.jar`, and its SHA-1 (`1ca964122c53f03f6fc3938b58c16d63b40490ab`) matches the `.sha1` recorded beside it. A jar is a zip, and a `.class` file's constant pool and `Code` attribute can be decoded without a JVM. Reading the shipped bytecode of the exact artifact the tree pins:

```
JSON.toJSON(Object)
  → JSON.toJSON(Object, SerializeConfig)
      → SerializeConfig.getObjectWriter(Class)
      → JavaBeanSerializer.getFieldValuesMap(Object)
          → FieldSerializer.getPropertyValue(Object)
              → FieldInfo.get(Object)
                  → java.lang.reflect.Method.invoke(...)      ← the getter, reflectively
      → JSON.toJSON(Object)  on every value it collected      ← and it RECURSES
```

That is read out of the class files, not out of documentation. `TypeUtils.computeGetters` is present and carries the `get` / `is` prefix constants and the `getName` / `getParameterTypes` / `getReturnType` / `getModifiers` reflection calls, so a public no-arg `getX()` with a matching field is collected by default with no annotation required.

And nothing in `Payment` opts out: the class carries only Lombok `@Builder`, `getCredentials()` at `:28` is public, the backing field is not `transient`, and there is no `@JSONField(serialize = false)`, no `@JSONType` and no `SerializeFilter` anywhere in the tree.

**Not confirmed — the web3j half.** `org.web3j:core:3.3.1` is **not** in that local repository (it holds fastjson, Spring, Lombok, Mongo and the rest, but no `org/web3j` directory at all), it is not one of the three committed jars, and there is no network. There is also no in-repo compile-time evidence to fall back on: `getEcKeyPair`, `getPrivateKey` and `ECKeyPair` **appear nowhere in the 228 Java files**, so the tree never demonstrates the accessor shape it would compile against. Whether `Credentials` exposes a public getter chain ending at the secp256k1 private key is exactly as unverified as this review left it.

**Verdict: still an inference.** The conditional has not moved, only narrowed — from "two libraries behave as documented" to "one class in one library exposes one public getter". The consequence remains asymmetric and unattractive: if it does, the ETH hot-wallet private key is written to the log as a decimal integer every thirty seconds for up to fifty minutes per unconfirmed withdrawal; if it does not, the line is harmless. Nothing available in this repository decides it, and it is not recorded as a finding.

Confirming it still needs `org.web3j:core:3.3.1` on disk. It does **not** need a working build — the same bytecode read used above would answer it in minutes, so the follow-up is "obtain the jar", not "make this tree compile".

**Same file, definitely true, no inference needed:** `PaymentHandler.java:162` — `logger.info("hexRawValue={}", hexValue)` — logs the complete signed raw transaction on the token withdrawal path. Because that signature carries no chain id ([F4](#f4)), anyone with log-read access holds a transaction that is **valid and replayable on every EVM chain simultaneously**.

**Remediation direction:** never pass an object holding `Credentials` to a serialiser; log the txid and business id only.

---

<a id="f4"></a>

### F4 — Chain-id-less signing, and an unconditional second broadcast to mainnet Etherscan · **LIVE** · _known critical, confirmed and extended_

**The signing call sites.** There are exactly **two** in the whole tree, both in `eth-support/.../service/PaymentHandler.java`, both the two-argument pre-EIP-155 form, both textually identical:

| Line | Path              | Code                                                                                               |
| ---- | ----------------- | -------------------------------------------------------------------------------------------------- |
| 123  | ether withdrawal  | `byte[] signedMessage = TransactionEncoder.signMessage(rawTransaction, payment.getCredentials());` |
| 160  | ERC-20 withdrawal | `byte[] signedMessage = TransactionEncoder.signMessage(rawTransaction, payment.getCredentials());` |

The three-argument overload `signMessage(rawTransaction, chainId, credentials)` is not used anywhere. There is no other signing call site in the tree: `bch`/`bsv`/`ltc` mint keys but their transfer endpoints are unimplemented stubs, and `bitcoin`/`usdt` delegate signing to the node.

**Consequence:** the produced signature has no chain id, so the transaction is valid on Ethereum mainnet, on every testnet, and on every EVM fork where that account has a balance. This is why "point `coin.rpc` at a testnet" was never a mitigation — a testnet-signed withdrawal from this code is also a valid mainnet withdrawal.

**The second broadcast, and whether it is conditional.** The mission asked whether the second broadcast is conditional. **In practice it is not.**

```java
// PaymentHandler.java — ether path
125:            EthSendTransaction ethSendTransaction = web3j.ethSendRawTransaction(hexValue).sendAsync().get();
128:            if (StringUtils.isEmpty(transactionHash)) { ... }
131:            else {
132:                if(etherscanApi != null){
133:                    logger.info("=====发送Etherscan广播交易======");
134:                    etherscanApi.sendRawTransaction(hexValue);
135:                }
```

```java
// PaymentHandler.java — ERC-20 path
163:            EthSendTransaction ethSendTransaction = web3j.ethSendRawTransaction(hexValue).sendAsync().get();
170:                if(etherscanApi != null){
171:                    logger.info("=====发送Etherscan广播交易======");
172:                    etherscanApi.sendRawTransaction(hexValue);
173:                }
```

The only guard is `etherscanApi != null`, on a field declared `@Autowired(required = false)` at `:57-58`. But the bean is defined **unconditionally**:

```java
// eth-support/.../config/EthConfig.java
35:    @Bean
36:    @ConfigurationProperties(prefix = "etherscan")
37:    public EtherscanApi etherscanApi(){
38:        EtherscanApi api = new EtherscanApi();
39:        return api;
40:    }
```

There is no `@ConditionalOnProperty` on it, unlike the `web3j` bean directly above at `:24`. So in any module that imports `EthConfig` — `eth`, `erc-token`, `erc-eusdt` — the field is always non-null and **the second broadcast always fires**. The `@Autowired(required=false)` reads as a switch and is not one.

**The destination is not configurable at all.** `eth-support/.../service/EtherscanApi.java:19` and `:34` hardcode `https://api.etherscan.io/api` as a string literal. Only the API key is a property (`etherscan.token`). Ethereum mainnet is compiled in.

**What this costs the operator:** the mainnet copy is the one that lands. Every ETH and ERC-20 withdrawal this tree performs is broadcast to Ethereum mainnet by way of a third party, whatever `coin.rpc` names, and — because of the chain-id-less signature — it is a _valid_ mainnet transaction rather than one the network rejects. Combined with [F3](#f3)'s `hexRawValue` log line, the same transaction is also sitting in the logs in relayable form.

**Remediation direction:** pass a chain id to `signMessage`, and make the Etherscan endpoint a property that defaults to unset with the call skipped when it is.

---

<a id="f5"></a>

### F5 — Every value-moving endpoint is an HTTP GET behind one shared static token · **LIVE**

**The authorization model is one bit.** `RpcAuthInterceptor` compares a single shared secret from the `X-Rpc-Auth-Token` header, and `RpcSecurityConfig` applies it to `/**` with no exclusions. The comparison itself is sound — `rpc-common/.../config/RpcAuthInterceptor.java:55-66` accumulates into `diff` without early return and folds the length difference in, and the 401 body at `:45` is deliberately uninformative. The startup guard at `RpcSecurityConfig.java:31-41` genuinely fails closed on a missing or under-32-character token.

But that is the _whole_ model. Reading a block height and sweeping the entire deposit float take the identical credential. There is no per-endpoint scope, no destination allowlist, no amount cap, no rate limit, no second approval, and no replay protection.

**And every value-moving endpoint is a GET:**

| Module                  | File:line                                        | Endpoint                                               | Effect                                                                        |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `eth`                   | `controller/WalletController.java:84`            | `GET /rpc/withdraw?address=&amount=`                   | pays from the hot wallet to any address                                       |
| `eth`                   | `controller/WalletController.java:68`            | `GET /rpc/transfer?address=&amount=&fee=`              | sweeps deposit addresses to any address                                       |
| `erc-eusdt`             | `controller/WalletController.java:154`           | `GET /rpc/withdraw`                                    | pays live-mainnet USDT ([F13](#f13)) to any address                           |
| `erc-eusdt`             | `controller/WalletController.java:118`           | `GET /rpc/transfer`                                    | sweeps every deposit address to any address                                   |
| `erc-eusdt`             | `controller/WalletController.java:98`            | `GET /rpc/transfer-from-address?fromAddress=&address=` | attacker picks both source and destination                                    |
| `erc-token`             | same lines                                       | same                                                   | same                                                                          |
| `usdt`                  | `controller/WalletController.java:56`            | `GET /rpc/withdraw`                                    | Omni USDT; **no `amount > 0` check**, `fee` accepted and ignored              |
| `usdt`                  | `controller/WalletController.java:71`            | `GET /rpc/transfer`                                    | sweeps the whole address book                                                 |
| `usdt`                  | `controller/WalletController.java:112`           | `GET /rpc/transfer-from-address`                       | attacker picks the funding address                                            |
| `bitcoin`               | `controller/WalletController.java:55`            | `GET /rpc/transfer`, `GET /rpc/withdraw`               | raw-tx build and broadcast; `fee` unvalidated                                 |
| `ect`                   | `controller/WalletController.java:40`            | `GET /rpc/transfer`, `GET /rpc/withdraw`               | the withdrawal from [F1](#f1); `fee` accepted and silently ignored            |
| `bch`/`bsv`/`ltc`/`btm` | `WalletController.java:144`/`:144`/`:140`/`:140` | `GET /rpc/transfer`, `GET /rpc/withdraw`               | stubs today — but the _mapping shape_ is inherited by whoever implements them |

**What an attacker gains:** a single GET, with the destination address and the amount in the query string, drains the float. And because these are GETs, the credential and the whole request are exposed in ways a POST would not be: every reverse-proxy and load-balancer access log records the full URL with the destination and amount; browser history and `Referer` headers carry it; it is CSRF-triggerable by any HTML in the perimeter that can emit a request with the header — and trivially replayable from any log.

`act/.../controller/WalletController.java:41` compounds the shape: `@RequestMapping("address/{account}")` with no `method` element accepts every verb.

**What cannot be determined here:** whether one `WALLET_RPC_AUTH_TOKEN` value is deployed for all thirteen services. If it is, compromise of any one service's environment — including the three that print node credentials in [F2](#f2) — unlocks the withdrawal endpoints of all thirteen.

**Remediation direction:** value-moving operations must be POSTs with a per-operation credential, a destination allowlist and an idempotency key.

---

<a id="f6"></a>

### F6 — Deposits are credited without checking that the transaction succeeded · **LIVE** (`eth`) / **LATENT** (`erc-*`)

**`eth` — no check of any kind.** `eth/.../component/EthWatcher.java:48-57`:

```java
48:                    if (StringUtils.isNotEmpty(transaction.getTo())
49:                            && accountService.isAddressExist(transaction.getTo())
50:                            && !transaction.getFrom().equalsIgnoreCase(getCoin().getIgnoreFromAddress())) {
51:                        Deposit deposit = new Deposit();
52:                        deposit.setTxid(transaction.getHash());
55:                        deposit.setAmount(Convert.fromWei(transaction.getValue().toString(), Convert.Unit.ETHER));
56:                        deposit.setAddress(transaction.getTo());
57:                        deposits.add(deposit);
```

The credit decision reads `to` and `value` straight out of the block body. The transaction **receipt**, which is where the success flag lives, is never fetched on this path. A transaction that is included in a block but reverts still carries its `to` and its `value` in the block body while transferring nothing.

**`erc-token` / `erc-eusdt` — the check exists and is commented out.** `erc-eusdt/.../component/TokenWatcher.java:62-66` and `:106-109`:

```java
62://                try {
63://                	   合约执行结果判断，此处暂时注释掉，后面需要确认是否一定需要
64://                    EthGetTransactionReceipt receipt =  web3j.ethGetTransactionReceipt(transaction.getHash()).send();
65://                    if(receipt.getTransactionReceipt().get().getStatus().equalsIgnoreCase("0x1")){
```

_"Contract execution result check, commented out for now, need to confirm later whether it is strictly necessary."_ It is strictly necessary. The check is still present and active in `replayBlockInit` at `:196` — the manual replay path — so the scheduled watcher is the one running without it.

**The compensating control, and why it is currently inert.** The token watcher has a second guard at `:87-90`, an Etherscan `getLogs` round-trip that checks a Transfer event was actually emitted, and the code comment says it exists _"防止低版本的token假充值"_ — to prevent fake deposits. It runs only when `contract.getEventTopic0()` is non-empty. Both modules set it:

```
erc-eusdt/src/main/resources/application.properties:51
contract.event-topic0=0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a1128f55a4df523b3ef

erc-token/src/main/resources/application.properties:51
contract.event-topic0=0xddf252ad1be2c89b69c2b068fc378daa952b7f163c4a11628f55a4df523b3ef
```

The real ERC-20 `Transfer` topic0 is `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef` — 64 hex digits. **Both of these are 63 digits**, each missing a different character, in exactly the digit-drop mangling style the upstream applied to the addresses. Neither will ever match. `checkEventLog` returns false, `continue` fires, and **no deposit is ever credited on either module**.

So today the erc modules fail closed — no fake deposits, and no real ones either. That is not a control; it is a broken constant that happens to point the safe way. Correcting the topic0 to its proper 64 digits restores a real Transfer-log check, which is the right fix. **Deleting the line, or setting it empty, removes the guard entirely and makes the commented-out receipt check the only thing that was standing between this watcher and free money — and it is commented out.** The mangled topic0 is not in the frozen baseline of `wallet-rpc-mainnet-scan.mjs`, so nothing currently stops that edit.

**What an attacker gains:** on `eth` today, credit for ether that was never transferred, at the cost of the gas for a reverting transaction. On the erc modules, the same the moment topic0 is touched.

**Remediation direction:** uncomment and require the receipt status check on every deposit path; treat an unverifiable receipt as "not a deposit".

---

<a id="f7"></a>

### F7 — The token deposit watcher does not check which function was called · **LATENT**

**Where:** `erc-eusdt/.../component/TokenWatcher.java:69-82` (identical in `erc-token`)

```java
69:                        String input = transaction.getInput();
70:                        String cAddress = transaction.getTo();
71:                        if (StringUtils.isNotEmpty(input) && input.length() >= 138 && contract.getAddress().equalsIgnoreCase(cAddress)) {
73:                            String data = input.substring(0, 9);
74:                            data = data + input.substring(17, input.length());
75:                            Function function = new Function("transfer", Arrays.asList(), Arrays.asList(new TypeReference<Address>() {
79:                            List<Type> params = FunctionReturnDecoder.decode(data, function.getOutputParameters());
81:                            String toAddress = params.get(0).getValue().toString();
82:                            String amount = params.get(1).getValue().toString();
```

The only conditions are: the input is at least 138 characters, and the transaction is addressed to the watched contract. **The four-byte function selector is never compared to `transfer`'s `0xa9059cbb`.** Lines 73-74 slice the selector region apart to strip address padding and then decode whatever remains as `(address, uint256)`.

Any call to the contract with a compatible argument layout decodes as a transfer. `approve(address spender, uint256 value)` is the obvious one: same two argument types, same encoding, always succeeds, moves nothing, costs about 45,000 gas. An attacker calls `approve(theirDepositAddress, 10^12)` on USDT and this watcher reads it as a transfer of 10^12 units to their deposit address.

**Currently latent** for the same reason as [F6](#f6): the mangled topic0 makes the Etherscan check reject everything. A _correct_ topic0 would also catch this one, because `approve` emits `Approval`, not `Transfer`. An _empty_ topic0 leaves nothing at all in the way.

**Remediation direction:** require `input.startsWith("0xa9059cbb")` before decoding, and decode the arguments properly rather than by string surgery.

---

<a id="f8"></a>

### F8 — Trust-all TLS on the deposit-detection transport, feeding fastjson 1.2.31 · **LIVE**

**Where:** `bch|bsv|ltc|btm|eos|xmr/.../util/SSLClient.java:19-26` — six byte-identical copies:

```java
19:        SSLContext sslContext = new SSLContextBuilder().loadTrustMaterial(null, new TrustStrategy() {
20:            //信任所有
21:            public boolean isTrusted(X509Certificate[] chain, String authType) throws CertificateException {
22:                return true;
23:            }
24:        }).build();
```

_"Trust everything."_ Every certificate chain is accepted. This client is what `HttpClientUtil.doHttpsGet` (`:274`) and `doHttpsPost` (`:48`, `:92`) use, which is the transport for every outbound call in the four modules that read deposits from a third-party explorer:

- `bch/src/main/resources/application.properties:26` — `…blockApi=https://bch-chain.api.btc.com/v3/`
- `bsv/...:26` — `https://bchsvexplorer.com/api/`
- `ltc/...:27` — `https://litecoinblockexplorer.net/api/`
- `eos/...:26` — `https://open-api.eos.blockdog.com/`

**The response is then handed to fastjson.** `bch/.../controller/WalletController.java:97` and `:121`, `bch/.../component/Watcher.java:87, 103, 176`, and the equivalents in the other five, all call `JSON.parseObject(retStr)`. The pinned version is **fastjson 1.2.31**, at `vendor/upstream-exchange/01_wallet_rpc/pom.xml:57-58`.

fastjson 1.2.31 predates the 1.2.48 fix for the universal `checkAutoType` bypass, and sits inside the long run of autotype-bypass advisories that began with CVE-2017-18349. The calls here are `parseObject(String)` returning a `JSONObject`, which is the least-exposed form — autotype is not explicitly enabled anywhere in the tree, and no `Feature.SupportAutoType` or `ParserConfig.setAutoTypeSupport` appears in any file.

**What an attacker gains:** the chain is _any network position between the service and the explorer_ → a self-signed certificate, unconditionally trusted → arbitrary JSON delivered to a known-vulnerable parser → potential code execution **inside a process that holds every private key that module has minted**. Even without reaching code execution, that same position lets an attacker fabricate deposits and balances outright, because these explorers are the sole source of truth for crediting on `bch`, `bsv`, `ltc` and `eos`.

**What could not be determined:** whether an exploitable gadget class is on the runtime classpath. That needs `mvn dependency:tree`, which needs Maven, which is not on this host. The honest position is that the TLS defect is certain and the parser is a known-bad version; the last step of the chain is unverified.

**Remediation direction:** delete `SSLClient` and use the default `HttpClients.createDefault()`, which validates; pin fastjson to a version past the autotype rewrite, or replace it.

---

<a id="f9"></a>

### F9 — Unencrypted bitcoinj wallet, plus a race that silently destroys keys · **LIVE**

**Where:** `bch|bsv/.../controller/WalletController.java:41-74` and `ltc/...:41-74` (litecoinj rather than bitcoinj; same code):

```java
41:	@GetMapping("address/{account}")
42:    public MessageResult getNewAddress(@PathVariable String account){
45:        NetworkParameters params  = MainNetParams.get();
47:        final File walletFile = new File(walletPath);
51:			wallet = Wallet.loadFromFile(walletFile);
57:        ECKey key = new ECKey();
59:        Address address = key.toAddress(params);
61:        wallet.importKey(key);
64:			wallet.saveToFile(walletFile);
65:			accountService.saveOne(account, address.toBase58());
```

**Key generation:** `new ECKey()` with no arguments, so entropy comes from the library's internal `SecureRandom`. No application-supplied seed, no HD derivation, no mnemonic anywhere in the tree.

**Storage:** a bitcoinj/litecoinj protobuf wallet at the wallet-path property — `/data/bch/bch.wallet`, `/data/bsv/bsv.wallet`, `/data/ltc/ltc.wallet` (properties line 25). **Nothing encrypts it.** There is no `Wallet.encrypt(...)` call, no `KeyCrypter`, and no wallet password property in any of the three modules. The private keys are at rest in plaintext, and nothing in this tree sets file permissions on that path. `MainNetParams.get()` at `:45` is the only network selector; there is no testnet branch.

**The race, which is the part not previously recorded.** Lines 51 → 61 → 64 are a read-modify-write over a shared file, in a Spring singleton `@RestController`, with **no synchronisation of any kind**. Two concurrent `GET /rpc/address/{account}` requests both load the same wallet snapshot at `:51`, each imports only its own key at `:61`, and whichever reaches `:64` second writes a wallet that does not contain the other's key.

The lost key's address has already been returned to the caller at `:67` and persisted to Mongo at `:65`. bitcoinj's `saveToFile` is temp-file-plus-rename, so the file is never left malformed — **the loss is silent.** Any deposit later sent to that address is permanently unspendable, and nothing anywhere will report an error.

**What an attacker gains:** nothing directly — this is a self-inflicted custody loss, triggered by ordinary concurrency and made trivially reproducible by anyone able to issue two simultaneous requests. It belongs in a custody review because the outcome is identical to theft.

Also note `:51` throws if the wallet file does not yet exist, and nothing in this code creates it; the module cannot bootstrap itself.

**Remediation direction:** encrypt the wallet, and serialise the load-import-save sequence behind a lock.

---

<a id="f10"></a>

### F10 — `act` cannot be shown to have the auth guard, and the gate that checks this is version-blind · **LIVE**

**The closure, verified module by module.** Thirteen modules carry `@SpringBootApplication`. Six of them — `bch`, `bsv`, `btm`, `eos`, `ltc`, `xmr` — ship their **own** copy of `RpcSecurityConfig` and `RpcAuthInterceptor` (the two classes are byte-identical across all six, and none of the six declares a dependency on `rpc-common`). The other seven — `act`, `bitcoin`, `ect`, `erc-token`, `erc-eusdt`, `eth`, `usdt` — reach the guard through `rpc-common` directly or through `eth-support` → `rpc-common`. Because `RpcSecurityConfig` sits in the shared `…​.config` package and every application class is in the shared root package, component scan picks it up.

**The exception:** `act/pom.xml` declares `rpc-common` **twice, with two different versions**:

```xml
49:        <dependency>
50:            <groupId>…</groupId>          <!-- the reactor groupId -->
51:            <artifactId>rpc-common</artifactId>
52:            <version>1.0</version>
53:        </dependency>
...
77:        <dependency>
78:            <groupId>…</groupId>          <!-- the reactor groupId -->
79:            <artifactId>rpc-common</artifactId>
80:            <version>1.2</version>
81:        </dependency>
```

Maven takes the **first** declaration for a duplicate groupId:artifactId, so `act` resolves `rpc-common` at **1.0**. The `rpc-common` in this reactor is version 1.2 (`rpc-common/pom.xml`, `${project-version}` = 1.2 at `pom.xml:36`). There is no `rpc-common:1.0` in this tree. Either the build fails to resolve it, or a stale 1.0 artifact in a local repository satisfies it — and a 1.0 predating the auth work would contain no `RpcSecurityConfig`, in which case **`act` boots with no interceptor and no startup failure**, because nothing else reads `rpc.auth-token`. That is the exact failure mode the auth work was created to eliminate.

I cannot resolve which, from this tree, without Maven.

**This is also a gap in `tooling/ci/wallet-rpc-auth-scan.mjs`.** Its `declaredArtifacts()` collects `<artifactId>` values with a regex and never reads `<version>`, so rule W1 sees the string `rpc-common` in `act/pom.xml` and passes it. The gate proves the _name_ of a guard-providing module appears in the pom; it does not prove the _version_ that resolves contains the guard. `act` is currently green and unproven.

**Remediation direction:** delete the `1.0` declaration; and make W1 compare versions, or fail any pom that declares the same artifact twice.

---

<a id="f11"></a>

### F11 — The depositor chooses which user account gets credited · **LIVE** (`eos`) / **LATENT** (`xmr`)

Both modules use a single shared deposit address and route the credit by a caller-supplied tag.

**`eos/.../component/Watcher.java:123-130`:**

```java
123:								String memo = transData.getString("memo");
125:								Boolean isNumric = memo.matches("^\\d+$");
126:								if(isNumric) {
130:										deposit.setUserId(Long.parseLong(memo));
```

**`xmr/.../component/Watcher.java:112-123`:**

```java
112:						String paymentId = incommObj.getString("payment_id");
115:						StringBuilder uidS = new StringBuilder();
116:						for(int j = 0; j < 8; j++) {
117:							uidS.append(paymentId.charAt(j*8 + 1));
118:	            		}
119:						Long uid = Long.parseLong(uidS.toString(), 16) + 345678;
123:						deposit.setUserId(uid);
```

The only validation on the eos path is that the memo is a digit string. There is **no check that the user id exists**, and the unexplained `+ 345678` offset on the xmr path is undocumented. A depositor sends a minimal amount with a chosen tag and it is credited to whichever account id they named.

This is the intended shared-address design for these two chains, so the finding is not that a tag is used — it is that the tag is trusted without an existence check, and that `Long.parseLong` on an unbounded digit string throws on overflow, which is caught at `eos Watcher.java:145-148` and **discards the whole batch**, so one crafted memo silently drops every legitimate deposit scanned alongside it.

**`xmr` is latent because the watcher does not work at all.** `xmr/.../component/Watcher.java:89-94` builds a `param2` object carrying `min_height` / `max_height` / `in: true`, and then never attaches it — line 100 posts only `param`:

```java
100:			String result = HttpClientUtil.doHttpPost(this.blockApi, param.toJSONString(), headerParam);
```

`get_transfers` is therefore called with no parameters, the height filter is dead, and `obj.getJSONObject("result").getJSONArray("in")` at `:103` will not find what it expects — caught at `:139-142`, returns `null`, and `Watcher.check` rolls the scan height back (`rpc-common/.../component/Watcher.java:45`), so the scanner retries the same range forever. `xmr` credits nothing. Separately, `paymentId.charAt(j*8 + 1)` reads index 57, so any `payment_id` shorter than 58 characters throws.

**Remediation direction:** validate the routing tag against a known account before crediting, and fail one deposit rather than the batch.

---

<a id="f12"></a>

### F12 — `walletpassphrase` and `walletlock` are dead code across the entire tree · **LIVE**

**Where:** `rpc-common/src/main/java/…/util/WalletOperationUtil.java:18-29`

```java
18:    public static void walletpassphrase(BitcoinRPCClient rpcClient, String passphrase) throws BitcoinException {
20:            rpcClient.query("walletpassphrase", passphrase, 60);
22:    }
25:    public static void walletlock(BitcoinRPCClient rpcClient) throws BitcoinException {
27:            rpcClient.query("walletlock");
29:    }
```

The 60-second unlock is confirmed exactly as reported. **What was not previously recorded is that neither method has a single caller anywhere in `01_wallet_rpc`.** A grep for `WalletOperationUtil`, `walletpassphrase` and `walletlock` across all 228 Java files returns only these declarations. There is no other unlock or lock anywhere in the tree.

So the question "is the lock guaranteed on the error path" has an answer that is worse than a missing `finally`: **there is no lock and no unlock on any path.** The odd indentation at `:19-21` and `:26-28` is the residue of a `try` block someone removed.

**What this implies about the deployment,** and both branches are defects:

- If the bitcoind / omnicore wallet is **encrypted**, every value-moving call in `bitcoin` and `usdt` fails — `BitcoinUtil.sendTransaction` (`bitcoin/.../WalletController.java:62`) and `omni_send` (`usdt/.../JsonrpcClient.java:144`) both require an unlocked wallet, and neither unlocks. `usdt/src/main/resources/application.properties:32` sets `coin.password=${USDT_WALLET_PASSWORD}`, which binds to **nothing** — the `Coin` entity has no `password` field, and `CoinConfig` uses the default `ignoreUnknownFields=true`, so it is silently discarded. The passphrase is configured, never read, never sent.
- If the wallet is **not encrypted**, or is permanently unlocked, then **anyone who reaches the node's RPC port has unlimited spend authority** — which is precisely the credential that [F2](#f2) writes to the log at startup.

**Also worth stating for whoever wires this up:** `walletpassphrase` takes the passphrase as an _RPC parameter_. The committed `BitcoinRPCClient` embeds `", params: "` in its exception messages, and those messages are returned to HTTP callers ([F15](#f15)). Connecting this utility naively would put the wallet passphrase into both the logs and the error responses.

**Remediation direction:** decide which branch is true; if the wallet is encrypted, unlock immediately before the send and relock in a `finally`, passing the passphrase somewhere it cannot reach an exception message.

---

<a id="f13"></a>

### F13 — The live mainnet Tether contract, pinned and unmangled · **LIVE** · _known critical, confirmed_

**Where:** `erc-eusdt/src/main/resources/application.properties:39`

```
contract.address=0xdac17f958d2ee523a2206206994597c13d831ec7
```

Forty valid hex digits, correct, unmangled: the live Ethereum mainnet Tether (USDT) contract. Its twin at `erc-token/src/main/resources/application.properties:39` is `0xdac17f958d2ee5232206206994597c13d831ec7` — thirty-nine digits, mangled in the upstream's style, and inert as written. Both confirmed by digit count and by comparison with the known contract address.

**Every other live-value constant found in the tree**, for completeness — all thirteen properties files were read:

| Module      | File:line                      | Value                                                                                               | Note                                                                                             |
| ----------- | ------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `usdt`      | properties:35                  | `coin.withdraw-address=1QDEimf6f4VrDqCSBmgfh1ReW9L2vHvvg`                                           | BTC mainnet P2PKH; the sweep destination                                                         |
| `xmr`       | properties:31                  | `coin.depositAddress=47ddRY4X…LGnFZnLpBGD8f`                                                        | Monero mainnet standard address                                                                  |
| `eth`       | properties:35                  | `coin.withdraw-wallet=UTC--2019-08-13T06-24-07.378035684Z--672881426632b13d8f474664c039acc7b5610b7` | keystore filename, 39 digits (mangled)                                                           |
| `erc-token` | properties:32                  | `…--67288142662b13d18f474664c039acc7b5610b7`                                                        | **a third distinct mangling of the same account**                                                |
| `erc-eusdt` | properties:32                  | `…--2b7d8aa02fccbd7bc69368fa30cabe22e3c2c2d.json`                                                   | a **different** account; the only `.json` suffix                                                 |
| `eth`       | properties (ignore-from)       | `0x672881426632b13d18f74664c039acc7b5610b7`                                                         | 39 digits; the platform's own hot wallet                                                         |
| `act`       | properties:30                  | `coin.master-address=ACT5i65XW1yRasdeLMD2rFJffRmndn91bho6`                                          | carries the `asd` mangling                                                                       |
| `ect`       | properties:12, :31             | `esV75BQfiEiKdgaivjasdw7EXk3BwJiscX`, `esV75BQfiEiKdasdejEYCt7EXk3BwJiscX`                          | `asd` mangling; the second is the [F1](#f1) address                                              |
| `eos`       | properties:35                  | `coin.depositAddress=AAAAAAAAAAAAA`                                                                 | dummy; eos deposit scanning is non-functional as shipped                                         |
| `btm`       | properties:26                  | `bytom.api.url=http://111.111.111.111:9888/`                                                        | the upstream's "redaction" is a **routable** address, over plain HTTP, carrying the access token |
| `btm`       | properties:32                  | `bytom.alias=<the upstream vendor’s own name>`                                                      | the node-side signing key alias                                                                  |
| `ect`       | properties:7                   | `spring.data.mongodb.uri=mongodb://127.0.0.1:27017/wallet`                                          | the **only** module still hardcoding the Mongo URI                                               |
| all         | properties (init-block-height) | thirteen mainnet start heights                                                                      | already frozen by the mainnet gate                                                               |

All of these except the `erc-eusdt` `.json` keystore and the `ect` Mongo URI are already pinned in the 38-entry frozen baseline of `tooling/ci/wallet-rpc-mainnet-scan.mjs`. **The two mangled `contract.event-topic0` values from [F6](#f6) are not in that baseline and should be**, because they are the only thing currently preventing fake deposit credits and a one-character edit removes them.

**Remediation direction:** owner action — this is the highest-priority M4 entry in the existing baseline and nothing changes it.

---

<a id="f14"></a>

### F14 — Service-registry beacon to a routable third-party address · **LIVE**

Ten of thirteen `application.properties` set:

```
eureka.client.serviceUrl.defaultZone=http://111.111.111.111:7000/eureka/
eureka.instance.prefer-ip-address=true
```

(`bch`, `bsv`, `ltc`, `btm`, `eos`, `xmr`, `bitcoin`, `usdt`, `eth`, `erc-token`, `erc-eusdt` at line 15 or 22; `act` and `ect` use `127.0.0.1`.) The same address appears as `spring.kafka.bootstrap-servers=111.111.111.111:9092`.

`111.111.111.111` is the upstream's redaction placeholder, and it is **a routable public address, not a documentation range**. With `prefer-ip-address=true`, a Spring Cloud Eureka client registers itself by publishing its own reachable IP and port to that registry, over plain HTTP, unauthenticated, on a repeating heartbeat.

**What an attacker gains:** whoever controls that address learns the network location and port of every process in the deployment that holds withdrawal keys, without touching the auth token that protects the endpoints. The registry is also a source the client takes instructions from.

**Remediation direction:** make the registry and broker addresses environment placeholders with no default, as the Mongo URI already is.

---

<a id="f15"></a>

### F15 — Raw node and exception text is echoed to HTTP callers · **LIVE**

Every controller in the tree ends its catch blocks with the exception message in the response body. Representative:

- `bch/.../WalletController.java:54, 72, 112, 133` — `return MessageResult.error(500,"error:" + e.getMessage());`
- `bitcoin/.../WalletController.java:35, 51, 69, 84, 100`
- `usdt/.../WalletController.java:41, 67, 108, 133, 154, 170`
- `eth/.../WalletController.java:49, 64, 80, 94, 112, 132, 155`

The committed `BitcoinRPCClient` builds its exception messages from `", params: "`, `", response header: "` and `", response: "` (string constants present in `bitcoin-rpc-1.2.0.jar`), so for the `bitcoin` and `usdt` modules this echoes the raw node response and the RPC parameter array to the caller. Elsewhere it discloses filesystem paths (`"钱包文件不存在"` paths from `WalletUtils.loadCredentials`) and internal state.

Alongside it, `e.printStackTrace()` appears on essentially every catch in the tree — to stdout, unstructured, outside the logging framework.

**What an attacker gains:** node internals and RPC call shapes, which is reconnaissance rather than access — and, on the `walletpassphrase` path if it is ever wired up ([F12](#f12)), the passphrase itself.

**Remediation direction:** return a correlation id; log the detail.

---

<a id="f16"></a>

### F16 — `erc-token` and `erc-eusdt` are the same service twice · **LIVE**

| Property               | `erc-token`       | `erc-eusdt`         |
| ---------------------- | ----------------- | ------------------- |
| `server.port`          | 7004              | **7004**            |
| `coin.name`            | EUSDT             | **EUSDT**           |
| `coin.unit`            | EUSDT             | **EUSDT**           |
| `contract.address`     | mangled Tether    | **live Tether**     |
| `coin.withdraw-wallet` | account `672881…` | account `2b7d8aa0…` |

Two modules, one port — they cannot run on one host. More consequentially, `AccountService.getCollectionName()` (`rpc-common/.../service/AccountService.java:35-37`) derives the Mongo collection from `coin.getUnit()`, so both write to `EUSDT_address_book`, and `DepositEvent` (`:28`) publishes both to the Kafka `deposit` topic under the key `EUSDT`. **Two different contracts sharing one address book and one event stream, with different hot wallets.**

`act` and `bitcoin` also both claim `server.port=7001`.

**Remediation direction:** decide which of the two modules is real and delete the other.

---

<a id="f17"></a>

### F17 — Unbounded block-replay endpoint re-emits deposit events · **LIVE**

- `eth/.../WalletController.java:159` — `@GetMapping("sync-block")` → `watcher.replayBlockInit(startBlock, endBlock)`
- `erc-eusdt/.../WalletController.java:168` and `erc-token` — same

Neither validates the range, orders the bounds, or caps the span. `replayBlockInit` loops one block at a time issuing `ethGetBlockByNumber(..., true)` per iteration, so a single request naming a range of millions of blocks is a self-inflicted denial of service against both the service and its node.

More importantly, the replay path calls `depositEvent.onConfirmed(deposit)` directly for everything it finds. The only dedupe is `DepositEvent.onConfirmed` (`rpc-common/.../event/DepositEvent.java:24-30`), which checks `depositService.exists(deposit)` against this service's own Mongo — a per-service guard with no idempotency key on the emitted Kafka message.

**What could not be determined:** whether re-emission double-credits. That depends on the consumer of the `deposit` topic, which is outside this tree and was not reviewed. The tree's own position is that it emits without an idempotency key and relies on a local existence check.

**Remediation direction:** cap the range, and put an idempotency key on the emitted event.

---

<a id="f18"></a>

### F18 — Shared static HTTP client and response across threads · **LIVE**

**Where:** `bch|bsv|ltc|btm|eos|xmr/.../util/HttpClientUtil.java:31-32`

```java
31:    private static CloseableHttpClient httpClient = null;
32:    private static CloseableHttpResponse response = null;
```

Both are reassigned by every call to `doHttpsGet`, `doHttpsPost` and `doHttpPost` (e.g. `:274`, `:295`), and both are closed in each method's `finally` (`:302-309`). The deposit `Watcher` runs on its own thread (started at `event/ApplicationEvent.java:61` — `new Thread(watcher).start()`), concurrently with Tomcat request threads calling the same static methods.

Two concurrent calls therefore close each other's connections and can read a response object that belongs to a different logical request. `doHttpGet` at `:226` is the only method that correctly uses locals.

**What an attacker gains:** nothing directly, but in a service where the HTTP response decides who is credited how much, cross-request response confusion is a correctness defect with money on the other end of it.

`btm/.../util/ClientUtils.java:9-18` has the same shape — an unsynchronised `if (client == null)` check-then-assign on a static field, so the first caller's URL and access token win permanently.

**Remediation direction:** make the client fields local, or a properly shared thread-safe connection-manager-backed singleton.

---

<a id="f19"></a>

### F19 — Committed node credentials in `main()` harnesses · **LATENT** · _known_

- `act/src/test/java/ActClientTest.java:10` — `new ActClient("http://act:123456@47.74.42.87:8900/rpc")` — a node credential and a public IP, over plain HTTP. This is item **A3** of `OWNER-ACTIONS-WALLET-RPC-SECRETS.md`, deliberately left in the tree as evidence, and frozen by the mainnet gate. Whether that node is ours is still an open owner question and cannot be answered without network access.
- `usdt/src/main/java/…/config/JsonrpcClient.java:163` — `new JsonrpcClient("http://bitcoin:bitcoin@127.0.0.1:8888/")` — **this one is in `src/main`, not `src/test`**, so it compiles into the production artifact. Loopback and a trivial credential, so the value is worthless, but it is a `main()` in a shipped class that constructs a node client, and it is not covered by the `${USDT_NODE_RPC_URL}` externalisation.
- `eth-support/.../service/EtherscanApi.java:65-71` — a `main()` with a commented-out `sendRawTransaction` of a real signed transaction, plus a live txid and the real Transfer topic0.
- `ect/.../component/EctApi.java:158-176` — a comment block documenting the **removed** `main()` that held a second hardcoded wallet secret. Item **A2**; the code is gone, the value remains disclosed by history.

Latent because surefire does not run `main()` and nothing invokes these.

**Remediation direction:** owner action A3; delete the `src/main` harness.

---

<a id="f20"></a>

### F20 — A locally rebuilt, unreferenced 1.4 MB crypto library · **LATENT**

Full detail in the [jar inventory](#3-jar-inventory). The two corrections that matter to the framing this review was commissioned with:

**It is not on any classpath** — not `ltc`'s, not `xmr`'s, not any module's. No `pom.xml`, no `.classpath`, and no source file in the repository contains the string `alice`. The modules that mint keys take their crypto library from elsewhere.

**And it is not anonymous.** The archive names its builder and its origin: built by `shaox` with Maven 3.5.3 on JDK 1.8.0_181, from an Eclipse workspace at `E:\ltctest\bitcoinj-alice-master\core`, on 2019-09-15 — one day before the same person, on the same machine, built the `litecoinj` jar that **is** on `ltc`'s classpath and **does** mint `ltc` keys. That is the more useful fact, and it points at the litecoinj jar rather than away from it.

672 of its 674 entries were recompiled in 2019 and wrapped in duplicated 2015 upstream metadata. No injected package, no embedded callout — and no way to check a single class body without a JDK.

**Remediation direction:** delete it; and treat the litecoinj jar from the same workspace as needing the same attribution it never got.

---

<a id="f21"></a>

### F21 — This tree has never been compiled by anyone · **LIVE**

Two independent proofs, either sufficient:

1. `vendor/upstream-exchange/01_wallet_rpc/pom.xml:21` declares `<module>xrp</module>`. There is no `xrp` directory on disk, and no file matching `*xrp*` anywhere under the tree. Maven fails immediately on _"Child module .../xrp does not exist"_, so the reactor cannot even be resolved, let alone built.
2. `ect/.../controller/WalletController.java:7` imports `com.spark.blockchain.rpcclient.BitcoinUtil`, and `ect/pom.xml` declares no dependency that supplies it — Maven does not propagate `rpc-common`'s system-scoped `bitcoin-rpc` to consumers. An unresolvable import is a compile error whether or not the class is used. **`ect` cannot compile**, and `eth-support/pom.xml:51-57` documents the identical failure having already been hit and worked around by hand in a different module.

Neither is a vulnerability. Both are stated as findings because together they establish the central premise of this review's method section: **nothing in this tree has ever been compiled, in this repository, by anyone.** Every judgement in this document — and in every prior document about this tree — is a judgement about source that no compiler has ever checked, in a tree whose own build file names a module that does not exist.

**Remediation direction:** none from this review; whether `xrp` is restored or removed is an owner decision.

---

## 3. Jar inventory

**Eighteen `.jar` files under `01_wallet_rpc`, but only three distinct artifacts.** The framing "eighteen binaries" is technically right and materially misleading: fourteen of the eighteen are the same 68,230-byte file copied into fourteen module directories. SHA-256 confirms byte-identity within each group.

| Artifact                                | Copies | Size        | SHA-256 (abbrev.)   | On a classpath? |
| --------------------------------------- | ------ | ----------- | ------------------- | --------------- |
| `bitcoin-rpc-1.2.0.jar`                 | 14     | 68,230 B    | `19DE7854…4C030F0F` | **3 of 14**     |
| `litecoinj-core-0.15.20190219.jar`      | 2      | 1,560,079 B | `0A150406…7C454B6E` | 2 of 2          |
| `bitcoinj-core-0.13-alice-SNAPSHOT.jar` | 2      | 1,399,770 B | `82A12432…89BF1294` | **0 of 2**      |

**Repository-wide count.** 45 `.jar` files exist in the repository. 13 of those sit under a `target/` directory and are build outputs of the other vendored trees (`admin-api.jar`, `exchange.jar`, `wallet.jar`, and so on). 45 − 13 = **32 checked-in library jars repo-wide**, which is the figure the brief cites. The 18 under `01_wallet_rpc` were enumerated and opened for this review; the other 14 are outside this scope and were not examined.

### Can any of them be verified?

**No. Not one of the three can be checksum-verified against anything, and that is the honest answer for all three — not only for the `-SNAPSHOT`.** There is no network on this host, so no coordinate can be checked against Maven Central; there is no JDK, so `jarsigner -verify` cannot run and no class body can be decompiled or byte-compared; and none of the three ships a detached signature or a checksum file. All three archives _did_ open — a jar is a zip — so what follows is what each one says about itself.

#### `bitcoin-rpc-1.2.0.jar` — the most trust-critical binary in the tree

```
Manifest-Version: 1.0        META-INF/maven/com.spark.bc/bitcoin-rpc/pom.properties:
Archiver-Version: Plexus Archiver    #Fri Jul 20 14:11:53 CST 2018
Built-By: yanqizheng                 version=1.2.0
Created-By: Apache Maven 3.5.0       groupId=com.spark.bc
Build-Jdk: 1.8.0_65                  artifactId=bitcoin-rpc
```

No `Implementation-Title`, `Implementation-Version` or `Implementation-Vendor` — those fields do not exist in this manifest. 72 entries, packages `com.spark.blockchain.rpcclient` and `com.spark.blockchain.util`, providing `BitcoinRPCClient`, `BitcoinRawTxBuilder`, `BitcoinAcceptor`, `Base64Coder`. Compiled at `<source>1.6</source>`, and its own embedded pom depends on `com.alibaba:fastjson:1.2.31`.

This is the client through which `bitcoin` and `usdt` reach their nodes — it builds, signs and broadcasts raw Bitcoin transactions, and it constructs the `Authorization: Basic` header from the credential in [F2](#f2). Nothing in the tree or on this host can establish that it is what it claims to be.

**It also carries the only non-standard host embedded in any of the 18 jars** — a deploy target recorded at the vendor's build time, inside its own pom:

```xml
<distributionManagement><repository>
    <url>http://maven.xinhuokj.com/repository/maven-releases/</url>
</repository></distributionManagement>
```

Metadata only, never read from a system-scoped jar, so not a runtime callout. Recorded because it is the one third-party host name attached to the tree's most privileged binary.

**Eleven of the fourteen copies are referenced by nothing.** Only `rpc-common/pom.xml:55-60`, `bitcoin/pom.xml:53-58` and `usdt/pom.xml:41-46` wire it in with `<scope>system</scope>` and a `<systemPath>`. The copies in `lib/`, `act`, `bch`, `bsv`, `btm`, `ect`, `eos`, `erc-eusdt`, `erc-token`, `eth` and `eth-support` are dead weight.

And `ect` has the inverse problem: `ect/.../controller/WalletController.java:7` imports `com.spark.blockchain.rpcclient.BitcoinUtil`, and `ect/pom.xml` declares no `bitcoin-rpc` dependency at all. Maven does not propagate a system-scoped dependency transitively, so `rpc-common` does not supply it — **`ect` cannot compile.** `eth-support/pom.xml:51-57` carries an in-tree comment confirming this is a known, previously-hit failure mode:

> _"Maven drops rpc-common's transitive dependencies for consumers because its bitcoin-rpc entry is system-scoped with an unresolvable systemPath, so this module did not compile at all."_

#### `litecoinj-core-0.15.20190219.jar` — the library that mints `ltc` keys

```
Built-By: shaox · Apache Maven 3.5.3 · Build-Jdk 1.8.0_181
META-INF/maven/org.litecoinj/litecoinj-core/pom.properties:
  #Mon Sep 16 10:03:42 CST 2019
  version=0.15.20190219 · groupId=org.litecoinj
  m2e.projectLocation=E:\ltctest\litecoinj-master\core
```

A locally-built jar, produced from an Eclipse workspace at `E:\ltctest\` on somebody's Windows machine on 2019-09-16. It is referenced honestly and explicitly at `ltc/pom.xml:62-69` and `xmr/pom.xml:62-69` — but under **fictitious coordinates**: the pom declares `org.litecoin:litecoin-core`, while the jar's own embedded metadata says `org.litecoinj:litecoinj-core`. Harmless under system scope, where the path wins, and worth knowing because the GAV in the pom identifies nothing.

This is the crypto library that generates and stores every `ltc` private key ([F9](#f9)). Unverifiable.

#### `bitcoinj-core-0.13-alice-SNAPSHOT.jar` — attributable, and on no classpath at all

The brief describes this as _"a snapshot build of an unnamed fork, on the classpath of the two modules that mint keys."_ Both halves need correcting.

**It is not unnamed, and it is not anonymous.** The archive opens and names its builder:

```
Built-By: shaox · Apache Maven 3.5.3 · Build-Jdk 1.8.0_181
META-INF/maven/org.bitcoinj/bitcoinj-core/pom.properties:
  #Sun Sep 15 15:30:47 CST 2019
  version=0.13-alice-SNAPSHOT · groupId=org.bitcoinj
  m2e.projectLocation=E:\ltctest\bitcoinj-alice-master\core
```

Same builder, same machine, same `E:\ltctest\` workspace, one day before the litecoinj jar. "alice" is the source directory name of a fork — `bitcoinj-alice-master` — not an upstream bitcoinj release qualifier. Upstream has never published `0.13-alice-SNAPSHOT`, and `-SNAPSHOT` means the coordinate does not identify these bytes even in principle.

**It is on no classpath.** No `pom.xml`, no `.classpath`, no `.project` and no `.java` file anywhere in the repository contains the string `alice`. The two modules that hold it, `ltc` and `xmr`, take their crypto library from the litecoinj jar above via an explicit `<systemPath>` and import `org.litecoinj.*` exclusively — never `org.bitcoinj.*`. The four modules that _do_ import `org.bitcoinj.*` — `bch`, `bsv`, `btm`, `eos` — resolve it from the Maven coordinate `cash.bitcoinj:bitcoinj-core:0.14.5.2`, a third-party Bitcoin Cash fork, not from this file.

So the corrected statement is: **it is not on the classpath of the modules that mint keys, or of any module.** `bch` and `bsv` mint keys from a Maven-resolved fork; `ltc` mints keys from the litecoinj jar; `xmr` mints nothing.

**What is inside it.** 674 entries. The package inventory is clean — `org/bitcoinj/{core,crypto,params,script,store,wallet,…}` plus `org/bitcoin/{NativeSecp256k1,paymentchannel/Protos,protocols/payments/Protos}`, all of which are standard upstream bitcoinj 0.13 members. **No foreign or injected package exists in the archive.** A decompressed-content scan for URLs and IP literals found only the bundled CA/CRL endpoints in `org/bitcoinj/crypto/cacerts`, the stock upstream DNS seeds (`seed.bitnodes.io`, `bitcoin.petertodd.org`, and so on), `127.0.0.1`, and a false positive from the spongycastle version string. **No hardcoded external IP, no embedded callout.**

**What cannot be established.** 672 of the 674 entries are dated 2019-09; only 2 carry the original 2015-01 timestamps. The archive contains _duplicate_ `META-INF/maven/org.bitcoinj/bitcoinj-core/` metadata — one `pom.xml` at `2015-01-22 17:31` and one at `2019-09-15 15:30`, both 23,896 bytes — which a clean Maven build does not produce. So this is upstream 0.13 metadata wrapped around classes recompiled locally in 2019 from a fork. **Whether those recompiled class bodies differ from upstream cannot be determined without a JDK**, and the package inventory being clean says nothing about it: a one-line change inside `org.bitcoinj.core.ECKey`'s constructor adds no new class name.

**Verdict on this jar:** latent rather than live, and no less serious for it. 1.4 MB of locally rebuilt, unsigned, checksum-unverifiable crypto library, sitting in the `lib/` directories of two key-handling modules where the local convention is that `lib/` jars become system-scoped dependencies — one `<systemPath>` line away from being the code that generates private keys, and with the one property that matters, the behaviour of its `ECKey` constructor, unverified. It is the only artifact here whose honest answer to "what is this" is _nobody in this repository can say_.

---

## 4. Dependency versions and CVE surface

Only versions **written in a pom** are listed. Nothing was resolved, so transitive versions are unknown and no transitive CVE claim is made.

| Coordinate                                            | Version as literally written | Declared at                                                 |
| ----------------------------------------------------- | ---------------------------- | ----------------------------------------------------------- |
| `org.springframework.boot:spring-boot-starter-parent` | **1.5.10.RELEASE**           | `pom.xml:32-33`                                             |
| `spring-cloud-dependencies`                           | **Edgware.RELEASE**          | `pom.xml:45-46` (`${spring-cloud.version}`, `:39`)          |
| `com.alibaba:fastjson`                                | **1.2.31**                   | `pom.xml:57-58`                                             |
| `org.web3j:core`                                      | **3.3.1**                    | `pom.xml:62-63` **and again at** `:95-96` (duplicate entry) |
| `cash.bitcoinj:bitcoinj-core`                         | **0.14.5.2**                 | inline in `bch`, `bsv`, `btm`, `eos` (`pom.xml:17-19`)      |
| `org.litecoin:litecoin-core` (system jar)             | **0.15.20190219**            | `ltc                                                        | xmr/pom.xml:62-69` — GAV does not match the jar |
| `com.spark.bc:bitcoin-rpc` (system jar)               | **1.2.0**                    | `pom.xml:76-82`                                             |
| `com.github.briandilley.jsonrpc4j:jsonrpc4j`          | **1.4.6**                    | inline in 11 modules                                        |
| `com.mashape.unirest:unirest-java`                    | **1.4.9**                    | `pom.xml:100-101`; **no version** in `ect`                  |
| `org.apache.commons:commons-lang3`                    | **3.4**                      | `pom.xml:38` (`${commons-lang3.version}`)                   |
| `org.projectlombok:lombok`                            | **1.16.20**                  | `pom.xml:72-74`                                             |
| `spring-boot-devtools`                                | **1.5.9.RELEASE**            | `pom.xml:67-68`                                             |
| `io.reactivex:rxjava`                                 | **1.3.4**                    | inline in `eth`, `act`, `ect`, `erc-token`, `erc-eusdt`     |
| `com.google.guava:guava`                              | **16.0.1**                   | inline in `ltc`, `xmr`                                      |
| `com.google.protobuf:protobuf-java`                   | **2.5.0**                    | inline in `ltc`, `xmr`                                      |
| `com.madgag.spongycastle:core`                        | **1.51.0.0**                 | inline in `ltc`, `xmr`                                      |
| `com.lambdaworks:scrypt`                              | **1.4.0**                    | inline in `ltc`, `xmr`                                      |
| `io.bytom:bytom-sdk-java`                             | **1.0.2**                    | inline in `btm`                                             |
| Jackson                                               | **not stated in any pom**    | inherited from the Boot 1.5.10 BOM                          |
| Mongo driver                                          | **not stated in any pom**    | inherited from the Boot 1.5.10 BOM                          |
| Kafka client                                          | **not stated in any pom**    | inherited from the Boot 1.5.10 BOM                          |
| `commons-codec`                                       | **not stated in any pom**    | inherited; declared without a version in `act`, `ect`       |

Java source/target is `1.8` in every module that sets it. `bitcoin/pom.xml` is the only module that never configures `maven-compiler-plugin` at all, so its Java level is not stated. `erc-token` and `erc-eusdt` version themselves with `${parent.version}`, a deprecated Maven 2 expression; it resolves, but it is a latent portability issue. **No `<repository>` or `<pluginRepository>` is declared anywhere in the reactor** — every non-system dependency must come from Maven Central.

**What can be said honestly about this set:**

- **fastjson 1.2.31** is the one that matters, and it matters because of [F8](#f8). It predates the 1.2.48 `checkAutoType` rewrite and sits inside the autotype-bypass series that began with CVE-2017-18349. The tree never enables autotype explicitly, and all parsing is `parseObject(String)` — the least-exposed form. Whether a usable gadget is on the runtime classpath is **unknown**, because that needs `mvn dependency:tree`.
- **Spring Boot 1.5.10.RELEASE** (Jan 2018) is long past end of life and pulls Spring Framework 4.3.x, a line with published advisories including CVE-2018-1270, CVE-2018-1271, CVE-2018-1272 and CVE-2018-15756. **This review does not assert any of these is reachable here** — reachability depends on which starters resolve, which is exactly what could not be determined. The honest statement is: the platform is eight years unmaintained and its transitive set was never enumerated.
- **`spring-boot-devtools`** appearing in `dependencyManagement` is worth a second look by whoever resolves the tree: devtools ships a remote-restart endpoint that is a remote code execution primitive when enabled. It is version-managed here, not necessarily depended on; no module's direct dependency on it was found, but the transitive set is unknown.
- **web3j 3.3.1** (2018) is the library whose `Credentials` accessors [F3](#f3) depends on and which could not be opened.
- **`cash.bitcoinj:bitcoinj-core:0.14.5.2`** is a third-party fork of bitcoinj under a groupId that is not `org.bitcoinj`. Whether that coordinate resolves to a public artifact, who publishes it, and what its checksum is are all **unverified** — it is a Maven-resolved dependency in the four modules that generate or handle Bitcoin-family keys, and it deserves the same scrutiny as the committed jars.

---

## 5. What this review does **not** cover

Stated plainly, because a review's boundary is part of its result.

1. **Anything dynamic.** No compilation, no execution, no tests, no fuzzing, no runtime observation. No JDK, JRE or Maven on this host. Every finding is static.
2. **The transitive dependency graph.** Never enumerated. All CVE discussion is limited to directly declared versions, and no claim of reachability is made for any advisory.
3. **The class bodies of any `.jar`.** All three distinct archives were opened and their manifests, embedded coordinates and package inventories read — see [§3](#3-jar-inventory). None was checksum-verified against a published artifact, and **no compiled class body was decompiled or compared to upstream**, because that needs a JDK. A modification inside an existing method is invisible to everything this review could do.
4. **Any deployed environment.** Every `${VAR}` value is unknown, including whether `WALLET_RPC_AUTH_TOKEN` is shared across services — which decides the blast radius of [F5](#f5).
5. **Filesystem and container posture.** Permissions on `/data/*/​*.wallet` and `/data/eth/data/keystore`, backup policy, log retention, and who can read stdout — the last of which is what turns [F1](#f1), [F2](#f2) and [F3](#f3) from findings into losses.
6. **Downstream consumers.** The Kafka `deposit` and `withdraw-notify` consumers were not reviewed, so the money impact of [F17](#f17) is stated as a dependency, not a conclusion.
7. **The chains and nodes themselves.** No balance was checked at any address named here, and whether the node at `47.74.42.87` is ours ([F19](#f19)) is still open.
8. **Cryptographic implementation.** `new ECKey()`'s entropy is delegated to the library's `SecureRandom`. For `bch` and `bsv` that library is a Maven-resolved third-party fork (`cash.bitcoinj`) that was never resolved or inspected; for `ltc` it is a jar built on one person's Windows machine in 2019 whose class bodies could not be read ([§3](#3-jar-inventory)). If either RNG were weakened, every key those three modules have ever minted would be predictable, and **nothing in this review would have detected it.**
9. **The other 14 checked-in jars** outside `01_wallet_rpc`, and the 13 build outputs under `target/`.
10. **The rest of the vendored exchange.** This review covers `01_wallet_rpc` only. The brief's figure of 878 Java files repo-wide means roughly 74% of the vendored tree remains unread.

---

## 6. Verdict

**No. This tree must not be pointed at real value in its current state, and no amount of configuration makes it safe.**

The three findings this review was commissioned to confirm are all real, and all three are confirmed with the exact call paths ([F4](#f4), [F13](#f13)). But they are not the reason for the verdict, because each is at least arguably a configuration problem — a hardcoded URL, a missing argument, a contract address.

The reason for the verdict is that **three separate services write a live spending credential to a log sink on an ordinary success path**:

- `ect` prints the withdrawal signing secret on every withdrawal ([F1](#f1))
- `bitcoin`, `usdt` and `act` print node RPC credentials at startup ([F2](#f2))
- `eth-support` passes an object holding the ETH private key to a JSON serialiser every thirty seconds ([F3](#f3))

Those are not settings. They are code, on the happy path, and they mean that in this tree **the security boundary of the hot wallets is the read permission on the log files**. Anyone who can read logs — an operator, an aggregator, a backup, a support engineer, a compromised sidecar — can drain them. Rotating the secrets identified in `OWNER-ACTIONS-WALLET-RPC-SECRETS.md` does not help: the code prints the _replacement_ just as freely as the original.

Underneath that sit two structural properties that no fix to individual lines will change:

**The authorization model is one bit.** One static shared token, sent as a plain header, gates everything from reading a block height to sweeping the entire float to an arbitrary address in a single HTTP GET ([F5](#f5)). There is no destination allowlist, no cap, no second approval, no idempotency. That is not a wallet service; it is a remote control with a password on it.

**And the deposit side trusts what it should verify.** Success checks are absent or commented out ([F6](#f6)), the function selector is never checked ([F7](#f7)), the transport that carries the deposit truth trusts every certificate presented to it and hands the result to a known-vulnerable parser ([F8](#f8)), and the only reason the ERC modules are not currently minting free credit is that somebody mangled a constant ([F6](#f6)). A control that works because a typo points the safe way is not a control.

**On "point it at a testnet."** That option does not exist for this tree, and this review confirms why with the code rather than by assertion. Withdrawals are signed without a chain id ([F4](#f4)), so a testnet-signed transaction is a valid mainnet transaction, and the same transaction is then broadcast a second time to a hardcoded mainnet Etherscan endpoint by a bean that is defined unconditionally ([F4](#f4)). The mainnet copy is the one that lands.

**What this verdict is not.** It is not a claim that the tree is unfixable, and it is not a finding count. Several of these are three-line changes. The claim is narrower and firmer: **the current state is not a starting point that a custody decision can rest on**, because the same reading that found the known criticals also found that a service prints its own hot-wallet key — and that finding was in a file that four previous documents about this tree had cited without opening.

The one thing that should be treated as more urgent than the rest of this document: **[F3](#f3) rests on an inference about two libraries this host could not open.** Confirming or refuting it takes minutes on a machine with a JDK, and it is the difference between "the ETH hot-wallet key is in the logs" and "it is not." Nothing else here changes as much on one check.

---

_Static analysis only. No JDK, JRE, Maven or network access was available. Nothing in this tree was compiled, executed, or dynamically tested, by this review or — per [F21](#f21) — by anything else._
