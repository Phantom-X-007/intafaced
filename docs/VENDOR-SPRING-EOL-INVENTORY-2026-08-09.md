# Vendor Spring EOL inventory — honest risk (L16 W4)

**Status:** inventory only — no version bumps in this document.  
**Tip at write:** re-derive with `git log -1 --oneline origin/main`.  
**Wall:** `vendor/upstream-exchange/**` (L16).  
**Class:** N (docs). **Owner gate for real money / licence:** Class X (counsel).

---

## Why this exists

Dependabot opened four Maven PRs (#1142, #1143, #1146, #1147). CI is green on all of them because **CI does not compile Java**. Merging a 57-package or Spring-Cloud generation bump without a compile probe is a false green.

Axis C2 (#1137) landed **Maven Dependabot config only**. The compile probe is a separate unit.

This inventory is the **risk map** so a human (or a later agent with compile proof) can decide what is safe to land vs close.

---

## What the tree is on tip (RAN-IT from poms)

| Pin | Where | EOL / risk (honest) |
| --- | --- | --- |
| **Spring Boot 1.5.9.RELEASE** | `00_framework/pom.xml` parent | Boot 1.5 EOL since **2019**. No security backports. Full platform is on an unsupported baseline. |
| **Spring Boot 1.5.10.RELEASE** | `01_wallet_rpc/pom.xml` parent | Same line as framework, **one patch ahead** — wallet-rpc and framework already **diverge**. |
| **spring-boot_version property 1.5.9.RELEASE** | framework parent | Aligns modules that use `${spring-boot_version}`; still 1.5.x EOL. |
| **Spring Cloud Edgware.RELEASE** | framework + wallet_rpc | Edgware is the Boot 1.5 companion train; also long EOL. |
| **fastjson 1.2.31** (wallet_rpc) / managed in framework | wallet_rpc pin; framework property | Pre-1.2.48 autotype series; wallet security review flags this. **#1142 bumps wallet_rpc → 1.2.84** (security line). |
| **jackson-databind 2.9.1** | framework parent | 2.9.x EOL; polymorphic typing elsewhere in tree is a separate mega-audit item. |
| **Shiro 1.2.2 / 1.3.2 / 1.4.0 mix** | core / pom / market / chat | Mixed minor trains; known-rememberMe class of issues on admin (admin not compose-deployed). |

**Divergence (framework vs wallet_rpc):**

- Boot parent: **1.5.9** (framework) vs **1.5.10** (wallet_rpc).  
- Spring Cloud BOM: both **Edgware.RELEASE**.  
- fastjson: framework uses a property/`(managed)`; wallet_rpc pins **1.2.31** directly.

---

## Dependabot open set — disposition rule

| PR | What it does | Land? | Why |
| --- | --- | --- | --- |
| **#1142** wallet_rpc production ×10 (incl. fastjson → 1.2.84, Boot → 1.5.22) | Patch/minor on 1.5 line + security fastjson | **Only after compile probe green on that branch** | Highest security value; still on Boot 1.5. |
| **#1146** framework production ×57 | Large minor/patch batch | **Only after compile probe + manual skim of money-path poms** | Blast radius huge; CI green is irrelevant. |
| **#1143** wallet_rpc Spring Cloud → **Hoxton.RELEASE** | Generation jump (Edgware→Hoxton) | **Close / do not merge** without explicit owner plan | Hoxton targets Boot 2.x; Edgware is Boot 1.5. Dependabot “ignore majors” does not catch Cloud train names. |
| **#1147** framework Spring Cloud → **Hoxton.RELEASE** | Same generation jump | **Close / do not merge** same as #1143 | Same train mismatch. |

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

## Next agent pick-up

1. Land compile probe if not on tip.  
2. Rebase #1142 onto tip; require probe signal; merge only if core (and wallet_rpc subset) compile.  
3. Close #1143/#1147 with this doc linked.  
4. #1146 only after #1142 lesson + probe.

**Nitro must decide:** none for inventory itself. Class X only if counsel wants a formal third-party supply attestation beyond this risk map.
