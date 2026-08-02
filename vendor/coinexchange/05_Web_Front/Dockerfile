# The vendored trading shell — the app the platform is supposed to BE.
#
# WHY THIS FILE DID NOT EXIST UNTIL NOW, which is the important part.
#
# The stated product direction has always been: the vendored exchange is the
# main app, and our services are added underneath it. 74 Vue screens, 78 routes,
# a complete trading UI.
#
# It has never been deployable. No `dist/`, no Dockerfile, in no compose file.
# The only way to see it was `npm run dev` on a developer's machine. Documents
# referred readers to `:8090`; nothing has ever served that port. Meanwhile a
# separate Next.js app under `apps/` became the de-facto product on :3000, and
# the drift was invisible because nobody could run the thing being drifted from.
#
# This makes it real: build it, serve it, put it in the fleet.
#
# ── Node 16, and it is not a free choice ────────────────────────────────────
#
# webpack 3 (2017) uses md4 for module hashing. Node 17+ ships OpenSSL 3, which
# removed md4 from the default provider, so the build dies with
# `ERR_OSSL_EVP_UNSUPPORTED` — an error that names neither webpack nor md4 and
# reads like a broken install.
#
# Node 16 ships OpenSSL 1.1.1, which still HAS md4. So on this image the build
# needs no workaround at all — and `--openssl-legacy-provider` is not merely
# unnecessary, it is REJECTED: `node: --openssl-legacy-provider is not allowed
# in NODE_OPTIONS`, exit 9. The flag only exists on the Node versions this pin
# is here to avoid. Setting it alongside the pin was belt-and-braces that
# strangled the build.
#
# Upgrading webpack is the real fix and it is a project, not a line: webpack 3
# to 5 across 74 Vue 2.5 SFCs with vue-loader 13. Pinning Node here is the
# honest interim, and it is pinned rather than floating precisely because
# `node:lts` would silently break this again.
FROM node:16-alpine AS build

WORKDIR /app

# npm, not pnpm. This tree has its own lockfile from the upstream vendor and is
# NOT part of the pnpm workspace — deliberately, so its 2017 dependency graph
# cannot reach our services.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund --legacy-peer-deps

COPY . .

# No NODE_OPTIONS. See the header: on Node 16 md4 is present, so nothing is
# needed — and the legacy-provider flag is refused outright by this runtime.
RUN npm run build

# ── serve ───────────────────────────────────────────────────────────────────
#
# nginx rather than webpack-dev-server: the dev server is not a production
# server, and running one in the fleet is how a dev-only default reaches a host.
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
