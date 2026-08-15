# Fleet tip images (D26-P2-04)

**Status:** law for the local and staging run path.  
**Board:** D26-P2-04 — running fleet = tip images, not stale layers or stale jars.  
**Leverage:** existing `Dockerfile` + `docker-compose.apps.yml` + `vendor/upstream-exchange-compose.yml` + `pnpm vendor-java:rebuild` / `vendor-compile.yml` (Phase A IN). Staging ADR: consume the unit; do not invent a second image strategy. Dual-book residual: [`../adr/2026-08-04-java-dual-book-residual.md`](../adr/2026-08-04-java-dual-book-residual.md) (D-S-17) — pointer only; this file is the operator rebuild.  
**Proof:** `pnpm fleet:tip-images` (`tooling/scripts/fleet-tip-image.mjs`) for TS compose law. Jar posture: `pnpm scan:vendor-java-jar-truth` + `pnpm vendor-java:rebuild` (D26-P2-07). Also ratcheted from `workspace-sync` so `pnpm verify` / CI gates see TS drift.

---

## The decision

> **The process that is running is the image built from the git tip you meant, or it is a refuse.** Hot-patching a container and calling `compose up` without `--build` is how yesterday's bytes keep taking money. Pulling the unqualified name `intafaced/app:dev` from Docker Hub because it was missing locally is how a stranger's image becomes the fleet.

Two run paths, one image unit:

| Path                        | Command                                                                                   | Why                                                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local / operator laptop** | `pnpm platform:up` → `docker compose -f docker-compose.apps.yml up -d --build`            | `--build` makes the shared `intafaced/app:dev` (and vendor-shell) from **this tree**.                                                                                   |
| **Staging host**            | Pull GHCR **digest** → `docker tag` to `intafaced/app:dev` → inspect → `up -d --no-build` | `--no-build` so a missing local image cannot rebuild from whatever happens to sit on the host disk. Digest is the bytes; the tag is only the name compose already uses. |

Neither path is “compose up and hope.” Neither path is a new Dockerfile kit, a second SPA image, or deploying `01_wallet_rpc`.

---

## Why `--build` locally and `--no-build` on staging are the same law

They look opposite. They answer the same question: **where do the bytes come from?**

- Locally the source of truth is **this checkout**. `--build` is how the fleet becomes tip.
- On staging the source of truth is **the digest the workflow pulled from GHCR**. `--no-build` is how the fleet stays that digest. Building on the host would silently replace reviewed bytes with whatever tree is on disk.

If you invert them you get the two failure modes this mountain exists to kill:

1. Local `up` without `--build` → stale layers, “I merged but the box didn’t.”
2. Staging `up` with `--build` (or Hub-pull of the unqualified name) → unreviewed or namesquatted bytes.

---

## The namesquatting trap (load-bearing)

`docker-compose.apps.yml` names `intafaced/app:dev`. That name is **unqualified**. Docker Hub is the default registry. This project does not control `docker.io/intafaced/app`.

If that tag is **absent locally**, `compose up` will fetch Hub. The log looks like a normal pull. The fleet is then not ours.

**Local mitigation:** `pnpm platform:up` always `--build`, so the name is created from this Dockerfile before compose needs it.

**Staging mitigation** (already in `.github/workflows/staging-deploy.yml`, threat model §6):

1. `docker pull ghcr.io/<repo>/app@sha256:…`
2. `docker tag` → `intafaced/app:dev` (name never missing → compose never searches Hub)
3. `docker image inspect` — local tag must be the pulled digest, else refuse
4. `docker compose -f docker-compose.apps.yml up -d --no-build`

Vendor shell is the same shape (`intafaced/vendor-shell:dev`), second image, still not a second strategy: its Dockerfile lives with the vendored tree because that lockfile is not the pnpm workspace.

---

## Operator runbook (local)

From a worktree on the tip you intend to run:

```bash
cp .env.example .env   # if you do not already have the two fleet secrets
pnpm platform:up       # MUST be --build. Do not invent a no-build alias for local.
pnpm platform:ps       # every svc-* / web / admin healthy; migrate Exited (0)
```

To throw away stale containers **and** rebuild:

```bash
pnpm platform:reset    # down -v, then up -d --build
```

`--build` still uses Docker **layer cache**. After a fetch whose runtime bytes should change, force a cache-bust (same Dockerfile, no second kit):

```bash
docker compose -f docker-compose.apps.yml build --no-cache
pnpm platform:up
```

Honesty inspect (only if Docker is actually present):

```bash
docker image inspect intafaced/app:dev --format '{{.Created}} {{.Id}}'
git rev-parse HEAD
git log -1 --format=%ci
```

If Created predates the tip you meant, the running fleet is yesterday. Rebuild. Do not Hub-pull `intafaced/app:dev` to “catch up.”

Do **not**:

- `docker compose -f docker-compose.apps.yml up -d` without `--build` as the everyday command
- `docker pull intafaced/app:dev` from Hub to “save a build”
- retag a random local image as `intafaced/app:dev` and `up --no-build` on a laptop
- add a second monorepo runtime Dockerfile / compose stack for “the real fleet”
- bring `01_wallet_rpc` into this compose file

Workspace packages stay in the image via Dockerfile COPY + `tooling/ci/workspace-sync.mjs`. If you add a service and skip compose or COPY, that gate already fails — this mountain does not replace it.

---

## Proof

```bash
pnpm fleet:tip-images
```

Fails if `platform:up` loses `--build`, if the compose `x-app` image is no longer `intafaced/app:dev` with `dockerfile: Dockerfile`, or if staging’s remote `up` is no longer `--no-build` after the digest tag.

---

## Vendor Java jars — retarget compose so the binary is tip

TS `intafaced/app:dev` is **not** the vendor exchange. `vendor/upstream-exchange-compose.yml` runs `eclipse-temurin:8-jre` and `-jar <module>/target/<module>.jar` from a **read-only bind** of `vendor/upstream-exchange/00_framework`. Compose does not Maven-build those jars. `vendor/.gitignore` ignores `**/target/`.

Modules compose actually launches (inventory is parsed by `tooling/scripts/vendor-java-rebuild.mjs`): `cloud`, `exchange`, `exchange-api`, `market`, `otc-api`, `ucenter-api`.

### The known lie (D-S-17)

Gitignored `*/target/*.jar` on a laptop were observed **built 2026-07-29**. Every dual-book **neutering commit landed 2026-07-31 → 2026-08-02**. Compose can therefore execute **pre-neutering** binaries while `vendor-java-money-scan` is green on **source**. That is the same defect class as a scan that walks zero files — the check is real; its object is not the object that runs.

**Do not “fix” this by `git add` of those jars.** They stay untracked. Committing them would put unverifiable money-path binaries in history (adoption ADR + `vendor/.gitignore`). The fix is a **rebuild from scanned source**, then compose restart.

`otc-api` may still fail to boot after a clean package (shiro-quartz / ehcache — documented in that compose file). Declared-and-failing is honest. Do not vendor a mystery jar onto the classpath to force a boot (D-S-17 standing rule).

### Rebuild commands (JDK host)

```bash
pnpm vendor-java:rebuild --dry-run
# prints: mvn -B -q -pl <compose modules> -am -DskipTests package
# cwd: vendor/upstream-exchange/00_framework

pnpm vendor-java:rebuild --check   # exit 0 = toolchain present; exit 2 = no JDK/mvn
pnpm vendor-java:rebuild           # actually package; writes gitignored jars
pnpm scan:vendor-java-jar-truth    # present jar older than module sources → fail

docker compose -f vendor/upstream-exchange-compose.yml up -d
```

CI already packages the same module set in `.github/workflows/vendor-compile.yml` job `package-compose-jars` (advisory, continue-on-error). A green CI package **does not** copy jars onto this laptop. Local compose still needs a local `pnpm vendor-java:rebuild` (or equivalent `mvn package`) before those containers match tip.

Pinned toolchain: OpenJDK 8 + Maven 3.8 — image `maven:3.8.8-eclipse-temurin-8` (same pin as the compile probe).

---

## Host honesty — Docker / JDK may be missing

This runbook is the law even when **this host cannot execute it**. Missing Docker or JDK is **INCOMPLETE**, not a silent skip and not a green “fleet matches tip.”

| Probe                                              | If missing / red                                      | Honest line to write                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `docker compose version`                           | No Docker                                             | TS running-fleet match **UNVERIFIED**. Commands above still apply on a Docker host. Do not invent a second kit. |
| `pnpm fleet:tip-images`                            | Fails only if git drifted from `--build` / digest law | Proves the **files**, not that this laptop rebuilt.                                                             |
| `pnpm vendor-java:rebuild --check`                 | Exit 2 — no `mvn` / JDK                               | Java runtime **UNVERIFIED**. Do not cite `vendor-java-money-scan` as jar truth (D-S-17).                        |
| `pnpm vendor-java:rebuild --dry-run`               | Always runnable (no toolchain)                        | Confirms compose jar inventory + the mvn line.                                                                  |
| `pnpm scan:vendor-java-jar-truth`                  | All compose jars **absent**                           | Honest **UNVERIFIED** (preferred over a stale jar).                                                             |
| same, jars **present** and older than module `src` | Gate fails                                            | **The lie is live on disk.** Rebuild. Never `git add` the jar.                                                  |

Windows (PowerShell) probes:

```powershell
docker compose version
mvn -v
pnpm fleet:tip-images
pnpm vendor-java:rebuild --dry-run
pnpm vendor-java:rebuild --check
pnpm scan:vendor-java-jar-truth
```

If `docker` / `mvn` are not on PATH, stop after `--dry-run` + jar-truth. Report INCOMPLETE. Do not copy a colleague’s `target/*.jar` into the tree.

---

## What this does not do

- Buy or SSH to a staging host (Class X).
- Pin infra images in `docker-compose.yml` by digest (named residual in the staging threat model).
- Claim the running laptop already matches origin/main — you still have to `platform:up` after fetch.
- Require Docker or JDK on the authoring host — document the commands; honesty check is the table above.
- Commit gitignored vendor jars, vendor a boot-fix jar, or run `01_wallet_rpc`.
- Re-litigate Grade D deletes / money-plane map (D26-P2-07 / D26-P2-02). This mountain **names the lie** and the rebuild/retarget path.
