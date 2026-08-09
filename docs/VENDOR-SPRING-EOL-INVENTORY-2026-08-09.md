# Vendor Spring EOL inventory — honest risk (L16 W4)

**Status:** inventory only — no version bumps in this document.  
**Tip at write:** re-derive with `git log -1 --oneline origin/main`.  
**Wall:** `vendor/upstream-exchange/**` (L16).  
**Class:** N (docs). **Owner gate for real money / licence:** Class X (counsel).

---

## Why this exists

Dependabot opened four Maven PRs (#1142, #1143, #1146, #1147). Ordinary CI green does **not** prove Java compiles.

Axis C2 (#1137) landed Maven Dependabot config only. **#1217 MERGED** the path-filtered Vendor compile probe (`continue-on-error`) for `00_framework` core. **#1143/#1147** Hoxton jumps closed; **#1226** ignores `spring-cloud-dependencies` on both maven roots. **#1142/#1146** remain HOLD for compile-proof.

This inventory is the **risk map** so a human (or a later agent with compile proof) can decide what is safe to land vs close.

---

## What the tree is on tip (RAN-IT from poms)

| Pin                                                     | Where                              | EOL / risk (honest)                                                                                                 |
| ------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Spring Boot 1.5.9.RELEASE**                           | `00_framework/pom.xml` parent      | Boot 1.5 EOL since **2019**. No security backports. Full platform is on an unsupported baseline.                    |
| **Spring Boot 1.5.10.RELEASE**                          | `01_wallet_rpc/pom.xml` parent     | Same line as framework, **one patch ahead** — wallet-rpc and framework already **diverge**.                         |
| **spring-boot_version property 1.5.9.RELEASE**          | framework parent                   | Aligns modules that use `${spring-boot_version}`; still 1.5.x EOL.                                                  |
| **Spring Cloud Edgware.RELEASE**                        | framework + wallet_rpc             | Edgware is the Boot 1.5 companion train; also long EOL.                                                             |
| **fastjson 1.2.31** (wallet_rpc) / managed in framework | wallet_rpc pin; framework property | Pre-1.2.48 autotype series; wallet security review flags this. **#1142 bumps wallet_rpc → 1.2.84** (security line). |
| **jackson-databind 2.9.1**                              | framework parent                   | 2.9.x EOL; polymorphic typing elsewhere in tree is a separate mega-audit item.                                      |
| **Shiro 1.2.2 / 1.3.2 / 1.4.0 mix**                     | core / pom / market / chat         | Mixed minor trains; known-rememberMe class of issues on admin (admin not compose-deployed).                         |

**Divergence (framework vs wallet_rpc):**

- Boot parent: **1.5.9** (framework) vs **1.5.10** (wallet_rpc).
- Spring Cloud BOM: both **Edgware.RELEASE**.
- fastjson: framework uses a property/`(managed)`; wallet_rpc pins **1.2.31** directly.

---

## Dependabot open set — disposition rule

| PR                                                                           | What it does                                | Land?                                                         | Why                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------ |
| **#1142** wallet_rpc production ×10 (incl. fastjson → 1.2.84, Boot → 1.5.22) | Patch/minor on 1.5 line + security fastjson | **Only after compile probe green on that branch**             | Highest security value; still on Boot 1.5. |
| **#1146** framework production ×57                                           | Large minor/patch batch                     | **Only after compile probe + manual skim of money-path poms** | Blast radius huge; CI green is irrelevant. |
| **#1143** wallet_rpc Spring Cloud → **Hoxton.RELEASE**                       | Generation jump (Edgware→Hoxton)            | **CLOSED**                                                    | Closed W4; #1226 ignore prevents re-open.  |
| **#1147** framework Spring Cloud → **Hoxton.RELEASE**                        | Same generation jump                        | **CLOSED**                                                    | Closed W4; #1226 ignore prevents re-open.  |

**Compile proof (Done bar for any land):**

1. `Vendor compile probe` workflow exists on tip (path-filtered, `continue-on-error`).
2. On the Dependabot branch, re-run or observe that job for `framework/core` (and for wallet_rpc PRs, add or run `mvn -pl … compile` in the same image).
3. No new jar vendored to force green (ADR 2026-08-04).

---

## What is NOT claimed

- This inventory is **not** a go-live of the Java book.
- Source scan green ≠ runtime jar safety (ADR 2026-08-04).
- Spring Boot 2/3 upgrade is **not** an agent free craft — multi-month product law + Class X if custody/licence surface changes.

---

## Next agent pick-up (wave 5)

1. **Compile probe on tip** — **DONE** (#1217).
2. Rebase **#1142** onto tip; require Vendor compile probe **signal** (advisory red OK); merge only with doctrine green + no jar invent.
3. **#1146** only after #1142 lesson + probe + money-path pom skim.
4. Boot 2/3 upgrade remains multi-month — not residual craft.

**Nitro must decide:** none for inventory itself. Class X only if counsel wants a formal third-party supply attestation beyond this risk map.

---

## Supply matrix (L16 W5)

| Surface                    | State on tip (re-derive)                                  | Residual                                              |
| -------------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| Vendor compile probe       | **#1217 MERGED** — framework core only, continue-on-error | Wallet_rpc still unbuilt by design (M7 barrier)       |
| Spring Cloud train jumps   | **#1226** ignore + **#1143/#1147 closed**                 | Hold **#1142/#1146**                                  |
| Dual-book door             | **#1218** interceptor + 4 apps                            | Grade C body kills in flight (admin/ucenter)          |
| Grade D mints              | Empty allowlist band (deleted)                            | Keep empty                                            |
| NOTICE                     | Compiled 2026-07-29                                       | Refresh only from artefacts — **no invent generator** |
| L11 desk `05_Web_Front/**` | Separate lane                                             | L16 one-writer: do not dual-write open L11 PRs        |
| Licence / counsel          | Class X                                                   | Nitro only                                            |
