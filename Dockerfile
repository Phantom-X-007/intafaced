# INTAFACED — one image for the whole platform.
#
# ── Why ONE image and not thirteen ──────────────────────────────────────────
#
# Every service and both apps live in a single pnpm workspace with shared
# `@intafaced/*` packages. `turbo run build` already builds the whole graph in
# dependency order, once, with one node_modules. Cutting that into thirteen
# per-service images would mean thirteen `pnpm install`s of the same lockfile
# and thirteen copies of the same `packages/contracts` build — the same work,
# thirteen times, for containers that will run on the same host anyway.
#
# So: build the workspace once, ship it once, and let the container's COMMAND
# decide which process starts. `docker-compose.apps.yml` sets that command per
# service. Thirteen containers, one image, one set of layers on disk.
#
# `turbo prune --docker` is the alternative and it is the right tool when the
# services deploy independently to different registries — it trades install
# time for a smaller per-service image. Here the whole fleet comes up together
# on one machine, so the smaller total is one shared image, not eleven pruned
# ones. Revisit this the day services get separate deploy pipelines.
#
# ── Non-root ────────────────────────────────────────────────────────────────
#
# The final stage runs as `node` (uid 1000, shipped by the base image). Nothing
# in the runtime writes inside /app except Next's `.next/cache`, and the one
# service that does write — svc-matching's journal — writes to a named volume
# mounted at /data.

# ── base ────────────────────────────────────────────────────────────────────
# bookworm-slim, not alpine: `@node-rs/argon2` (svc-identity's password hasher),
# esbuild and sharp all publish glibc prebuilds. On musl at least one of them
# falls back to a source build or to a slower JS path, and svc-identity's
# readiness endpoint reports argon2 availability — a service that silently
# starts without it is a service quietly hashing passwords the wrong way.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable
WORKDIR /app

# ── deps ────────────────────────────────────────────────────────────────────
# Manifests only, so this layer is invalidated by a dependency change and not
# by every edit to a source file. The list is explicit rather than `COPY . .`
# for exactly that reason.
#
# THE LIST MUST STAY IN SYNC WITH THE WORKSPACE, and nothing about a missing
# entry is obvious: pnpm installs a workspace it cannot see the manifest for as
# though it had no dependencies, so the failure surfaces as
# "Cannot find module '@intafaced/contracts'" during `pnpm build` — which reads
# like a broken import rather than a missing COPY.
#
# `tooling/ci/workspace-sync.mjs` compares this list against pnpm-workspace.yaml
# and fails the build when they diverge. That check exists because this went
# wrong three times in one day: twice in compose, once here.
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

COPY apps/admin/package.json                 apps/admin/
COPY apps/web/package.json                   apps/web/

COPY packages/auth/package.json              packages/auth/
COPY packages/config/package.json            packages/config/
COPY packages/contracts/package.json         packages/contracts/
COPY packages/db/package.json                packages/db/
COPY packages/events/package.json            packages/events/
COPY packages/exchange-contract/package.json packages/exchange-contract/
COPY packages/i18n/package.json              packages/i18n/
COPY packages/ledger-client/package.json     packages/ledger-client/
COPY packages/market-data/package.json       packages/market-data/
COPY packages/ui/package.json                packages/ui/
COPY packages/venue-adapter/package.json     packages/venue-adapter/

COPY services/svc-academy/package.json       services/svc-academy/
COPY services/svc-agents/package.json        services/svc-agents/
COPY services/svc-bank/package.json          services/svc-bank/
COPY services/svc-blueprint/package.json     services/svc-blueprint/
COPY services/svc-launch/package.json        services/svc-launch/
COPY services/svc-identity/package.json      services/svc-identity/
COPY services/svc-ledger/package.json        services/svc-ledger/
COPY services/svc-matching/package.json      services/svc-matching/
COPY services/svc-p2p/package.json           services/svc-p2p/
COPY services/svc-pay/package.json           services/svc-pay/
COPY services/svc-protocol/package.json      services/svc-protocol/
COPY services/svc-token/package.json         services/svc-token/
COPY services/svc-trade/package.json         services/svc-trade/
COPY services/svc-dex/package.json           services/svc-dex/
COPY services/svc-edge/package.json          services/svc-edge/
COPY services/svc-indexer/package.json       services/svc-indexer/
COPY services/svc-ws/package.json            services/svc-ws/

# `--frozen-lockfile` is the point of this line: the image resolves to exactly
# what the repo resolved to, or it fails. A lockfile drift discovered here is a
# broken build; discovered in production it is a different program.
#
# pnpm 10 blocks dependency install scripts by default. esbuild needs its to
# place the platform binary, and `tsx` — which every `db:migrate` script runs
# under — is esbuild. Without this the migrations fail at container start with
# a missing-binary error that reads like a bug in the migration.
RUN pnpm install --frozen-lockfile --config.dangerouslyAllowAllBuilds=true

# ── build ───────────────────────────────────────────────────────────────────
FROM deps AS build

# node_modules is already here from `deps` and .dockerignore keeps the host's
# out of the context, so this cannot overwrite it with a foreign install.
COPY . .

# turbo builds the dependency graph once: packages, then services, then the two
# Next apps. Nothing here touches Postgres or NATS — a build must not need the
# platform to be running.
RUN pnpm build

# ── runtime ─────────────────────────────────────────────────────────────────
# Deliberately keeps devDependencies. `tsx` is a devDependency and every
# service's `db:migrate` is `tsx scripts/migrate.ts`, so a production-pruned
# runtime could not run its own migrations — and the migration one-shot in
# compose runs from this same image on purpose, so that what migrates the
# database is byte-identical to what then reads it.
FROM base AS runtime

ENV NODE_ENV=production

COPY --from=build --chown=node:node /app /app

# svc-matching fsyncs its order journal here; a named volume is mounted over it
# so the books survive a container replacement (§5.1 recovery).
RUN mkdir -p /data/matching && chown -R node:node /data

USER node

# No CMD. Every container built from this image is told which process to be by
# `command:` in docker-compose.apps.yml — a default here would be a thirteenth
# opinion about what "the app" is.
