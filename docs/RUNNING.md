# Running the platform

Eleven services, two Next apps, and the infrastructure they need — one command.

---

## From a clean clone

```bash
git clone https://github.com/Phantom-X-007/intafaced.git
cd intafaced

cp .env.example .env      # the two fleet secrets — read the header of that file
pnpm install

pnpm platform:up          # docker compose -f docker-compose.apps.yml up -d --build
```

First run builds the image (~3–6 min, mostly `pnpm install` and `next build`).
After that, a full teardown-to-healthy cycle is about **100 seconds**.

You do **not** need to run migrations. You do **not** need to start the infra
separately. `platform:up` does both — see [Boot order](#boot-order).

### Did it work?

```bash
pnpm platform:ps
```

Twenty-one containers. Every `svc-*`, `web` and `admin` should read
`Up … (healthy)`, and `intafaced-migrate` should read `Exited (0)` — it is a
one-shot and exiting is what success looks like.

Then ask the services themselves:

```bash
for p in 4001 4002 4003 4004 4005 4006 4007 4008 4009 4011 4012; do
  curl -s "http://localhost:$p/health"; echo
done
```

Expected output, in order:

```
{"ok":true,"service":"svc-ledger","postingEnabled":true,"frozenReason":null,"frozenBy":null}
{"ok":true,"service":"svc-identity"}
{"ok":true,"service":"svc-token"}
{"ok":true,"service":"svc-trade"}
{"ok":true,"service":"svc-matching","enabled":true,"markets":0,"journalRecords":0}
{"ok":true,"service":"svc-pay"}
{"ok":true,"service":"svc-p2p"}
{"ok":true,"service":"svc-agents"}
{"ok":true,"service":"svc-bank"}
{"ok":true,"service":"svc-blueprint"}
{"ok":true,"service":"svc-protocol","chainId":31337,"custodial":false,"relayEnabled":true}
```

Two more checks worth doing once, because they prove the wiring rather than the
process:

```bash
# 8 JetStream streams, and svc-trade's 2 consumers on INTAFACED_MATCHING
docker exec intafaced-nats sh -c "wget -qO- 'http://localhost:8222/jsz?streams=1&consumers=1'"

# every migration applied, exit 0
docker compose -f docker-compose.apps.yml logs migrate
```

---

## Commands

| Command               | What it does                                                 |
| --------------------- | ------------------------------------------------------------ |
| `pnpm platform:up`    | Build if needed, then bring up **everything**                |
| `pnpm platform:ps`    | Status of all 21 containers                                  |
| `pnpm platform:logs`  | Follow all logs (`… logs -f svc-trade` for one)              |
| `pnpm platform:down`  | Stop everything, **keep** the data                           |
| `pnpm platform:reset` | Stop, **destroy every volume**, rebuild, come back up        |
| `pnpm infra:up`       | Postgres + Redis + NATS + observability **only** — for tests |
| `pnpm infra:down`     | Stop just the infrastructure                                 |

`infra:*` and `platform:*` share one compose project (`intafaced`), so they see
the same containers and the same volumes. `platform:up` after `infra:up` adds
the application containers to what is already running; it does not restart the
database.

---

## Ports

Everything binds `localhost`. Nothing here collides with the vendored exchange
stack (5506 / 6381 / 57017 / 9094 / 7000 / 6001).

### Applications

| Port     | Service         | Notes                                                   |
| -------- | --------------- | ------------------------------------------------------- |
| **3000** | `web`           | Next 15 storefront                                      |
| **3100** | `admin`         | Next 15 operator console (§14.6)                        |
| **4001** | `svc-ledger`    | THE BALANCE (§4.2) — every other money service calls it |
| **4002** | `svc-identity`  | accounts, rank (§4.1)                                   |
| **4003** | `svc-token`     | native economy (§4.3)                                   |
| **4004** | `svc-trade`     | spot product layer (§5.2)                               |
| **4005** | `svc-matching`  | THE ENGINE (§5.1)                                       |
| **4006** | `svc-pay`       | payments core (§6.1); webhooks at `/webhooks/:railId`   |
| **4007** | `svc-p2p`       | escrowed P2P (§6.2)                                     |
| **4008** | `svc-agents`    | agent fleet + model gateway (§8.2)                      |
| **4009** | `svc-bank`      | multi-currency accounts (§8.1)                          |
| **4011** | `svc-blueprint` | Identity Blueprint (§7.1)                               |
| **4012** | `svc-protocol`  | smart accounts, non-custodial (§17.4)                   |
| **4014** | `svc-ws`        | live depth stream (§5.2); the browser connects directly |

`svc-ws` is the second port a browser touches, and the only one besides svc-edge.
It has to be: the edge proxy buffers with `response.text()` and cannot carry a
websocket. It holds no database, no bus and no service secret, which is what
makes a second door acceptable — `services/svc-ws/README.md` argues it in full.

Four of these differ from the service's own default, because three services
independently chose `4004` and two chose `4008`. The compose file sets
`HTTP_PORT` explicitly; the changed ones are `svc-matching` (4005, which is what
svc-trade's `MATCHING_URL` default already pointed at), `svc-p2p` (4007),
`svc-blueprint` (4011) and `svc-protocol` (4012). **4010 is deliberately
unused** — leave it free.

### Infrastructure

| Port       | What                                                      |
| ---------- | --------------------------------------------------------- |
| **5433**   | Postgres (5432 inside the network; a native PG owns 5432) |
| **6380**   | Redis (6379 inside)                                       |
| **4222**   | NATS client                                               |
| **8222**   | NATS monitoring — `/healthz`, `/jsz`                      |
| **4317/8** | OTLP gRPC / HTTP                                          |
| **3200**   | Tempo                                                     |
| **9090**   | Prometheus                                                |
| **3001**   | Grafana (`intafaced` / `intafaced`)                       |

---

## Boot order

Encoded in `docker-compose.apps.yml` as `depends_on` conditions, and taken from
the code rather than from a guess. Three kinds of dependency exist and they are
not interchangeable.

```
postgres ──┐
           ├─→ migrate (one-shot, exits 0) ──┐
nats ──────┘                                 │
                                             ├─→ svc-ledger ─┬─→ svc-token
                                             │               ├─→ svc-pay
                                             │               ├─→ svc-p2p
                                             │               ├─→ svc-bank
                                             │               ├─→ svc-agents
                                             │               └─→ svc-trade
                                             ├─→ svc-identity ──→ svc-trade
                                             ├─→ svc-blueprint
                                             └─→ svc-protocol

nats ──────────→ svc-matching ──────────────────────────────────→ svc-trade

(no dependencies) web, admin
```

**1 · Schema assertions.** Nine services run a `SELECT 1 FROM <schema>.<table>`
at boot and `throw` if it fails — `agents.agent_definitions`, `bank.spaces`,
`blueprint.blueprints`, `identity.users`, `p2p.p2p_trades`, `pay.merchants`,
`token.token_params`, `trade.markets`, and svc-protocol's
`information_schema` lookup for `protocol.smart_accounts`. svc-ledger reads its
`chain_tip` row. All ten therefore wait on
`migrate: condition: service_completed_successfully`.

**2 · Stream ownership.** `JetStreamEventBus.connect` creates streams only for
the modules listed in `ownedStreams`
(`packages/events/src/jetstream-bus.ts`). **svc-trade owns none** —
`ownedStreams: []` — but it subscribes to `orderFilled` and `orderCancelled`,
which the catalog places on the `matching` stream, and it publishes
`intafaced.identity.xp.earned` on the `identity` stream. So svc-trade waits on
both svc-matching and svc-identity. Without that gate it exits at boot with:

```
NatsError: stream not found
  api_error: { code: 404, err_code: 10059, description: 'stream not found' }
```

**3 · HTTP callees.** Six services hold a ledger client. Most connect lazily, so
this is ordering rather than a hard boot requirement — with one exception:
**svc-p2p runs its settlement sweep once _before_ the HTTP listener opens**, and
that sweep posts to the ledger. For svc-p2p, svc-ledger is a genuine boot
dependency.

**Not dependencies, checked:** svc-pay and svc-bank open no bus connection at
all (their `index.ts` says so), so neither waits on NATS. svc-matching has no
`DATABASE_URL` — §5.1 gives it in-memory books and a file journal — so it does
not wait on `migrate`. Neither app calls a service today; `apps/web` reads no
environment and `apps/admin` reads only `LAUNCH_DROP`.

---

## Migrations

A single one-shot container (`migrate`) runs every service's `db:migrate` and
exits. Everything with a schema waits on
`condition: service_completed_successfully`.

The alternatives and why they lost are argued at the top of
`tooling/infra/migrate-all.mjs`. Short version: an entrypoint step runs once per
_replica_ and races itself the moment anything scales past one; per-service init
containers are correct but spread one question across ten places to look.

Each service migrates **as its own Postgres role** (`svc_ledger`, `svc_trade`,
…), never as `intafaced_ops`. Those roles own exactly one schema and hold no
database-level `CREATE`, so a migration that strays outside its own schema fails
here, in dev, with a permission error — instead of quietly becoming two services
sharing a table. Every runner is idempotent, so `up` re-runs them for free.

---

## Environment

One `.env`, copied from `.env.example`. Read that file's header — the two
variables at the top are the ones that break the platform silently.

`EDGE_PRINCIPAL_SECRET` and `INTERNAL_SERVICE_SECRET` must hold the **same value
across the whole fleet**. The edge signs a principal with the first and each
mounting service verifies it; svc-ledger checks the second and the six services
that post to it send it. Two different values means a platform that starts,
reports healthy, and 401s every authenticated request and every ledger post.

Three things make that hard to get wrong:

1. `.env.example` declares each of them **once**, at the top, with the reason.
2. `docker-compose.apps.yml` references them through a single YAML anchor, so
   there is one place in the compose file where each value comes from.
3. Both use compose's `${VAR:?message}` form — **if either is unset, compose
   refuses to start anything** and prints the message. There is no partial
   bring-up to debug.

Container-side connection strings are set by compose and are **not** read from
`.env`: inside the network the database host is `postgres:5432`, not
`localhost:5433`. The `DATABASE_URL` in `.env` is for processes you run on the
host — `pnpm dev`, `vitest`, `psql`.

---

## When it does not come up

**`required variable EDGE_PRINCIPAL_SECRET is missing a value`**
You have no `.env`. `cp .env.example .env`.

**A service sits in `Restarting`**
Read its logs first — every failure in this stack is loud at boot by design:

```bash
docker compose -f docker-compose.apps.yml logs svc-trade --tail 40
```

- `EnvError: Invalid environment for <service>` — the message lists every
  missing or malformed variable at once. Fix them all, then `pnpm platform:up`.
- `<schema> schema is missing — run migrations before starting <service>` — the
  `migrate` container failed. `docker compose -f docker-compose.apps.yml logs migrate`.
- `NatsError: stream not found` — a service reached the bus before the service
  that owns its stream. If you started containers by hand, start them through
  compose instead so `depends_on` applies.

**`bind: address already in use`**
Something on the host owns the port. Postgres and Redis are overridable
(`POSTGRES_HOST_PORT`, `REDIS_HOST_PORT` in `.env`); the application ports are
fixed in the compose file because they were chosen to stop the services
colliding with each other — change them there, and change the matching
`LEDGER_URL` / `MATCHING_URL` / `IDENTITY_URL` in the same edit.

**`svc-protocol` is healthy but `/ready` returns 503**

```json
{ "ready": false, "reason": "HTTP request failed ... http://host.docker.internal:8545/" }
```

Expected. The Protocol Plane needs an EVM RPC and the compose stack does not run
one — the chain is not ours (§17.2). Start an `anvil` on the host and it will
be found at `host.docker.internal:8545`, or point `PROTOCOL_RPC_URL` elsewhere
in `.env`. Nothing else in the platform depends on it.

**`svc-blueprint` reports `engine.usable: false`**
Also expected, and harmless: the mock engine fixes its `lastUpdate` at
construction and `isUsable()` calls anything older than 60 seconds stale, so an
in-process mock reports unusable one minute after boot. `/ready` still returns
200 and `BLUEPRINT_ENGINE_MODE=mock` still serves deterministic profiles. Point
`BLUEPRINT_ENGINE_MODE=http` at a real Neural Engine deployment for the real
thing.

**Everything is healthy but nothing works**
Check the two shared secrets are identical everywhere — see above. That failure
mode is silent by nature: healthy processes, 401 on every real call.

**Start over**

```bash
pnpm platform:reset      # destroys every volume, including the ledger
```

---

## The image

One image (`intafaced/app:dev`, ~1.5 GB) for all thirteen containers. The
Dockerfile's header argues why one and not thirteen; the short version is that
a pnpm workspace with shared `@intafaced/*` packages builds once, and thirteen
images would be the same `pnpm install` and the same `packages/contracts` build
repeated thirteen times. Each container is told which process to be by
`command:` in the compose file.

It runs as the non-root `node` user, installs with `pnpm install
--frozen-lockfile`, and `.dockerignore` keeps the host's `node_modules` out of
the build context entirely — a pnpm `node_modules` is a forest of absolute
symlinks and copying one from a Windows or macOS host into a Linux image is
either broken or, worse, silently works with whatever was installed there.

It deliberately keeps devDependencies: `tsx` is one, every service's
`db:migrate` runs under it, and the `migrate` one-shot uses this same image on
purpose — so what migrates the database is byte-identical to what then reads it.
