#!/usr/bin/env node
/**
 * WORKSPACE SYNC — every workspace package reaches the image and the fleet.
 *
 * Three times in one day a service was added and a deployment file was not:
 *
 *   1. five mounted services never received EDGE_PRINCIPAL_SECRET in compose,
 *      so each would crash-loop on a boot secret that has no default;
 *   2. svc-edge — the front door — had no compose block at all, so the fleet
 *      came up behind a door that was never opened;
 *   3. four services were missing from the Dockerfile's manifest list.
 *
 * None of those failed loudly at the point of the mistake. The Dockerfile one
 * is the nastiest: pnpm installs a workspace whose manifest it cannot see as
 * though it had no dependencies, so the error arrives much later as
 * "Cannot find module '@intafaced/contracts'" during a build — which reads like
 * a broken import, not a missing COPY.
 *
 * This makes all three loud, at the commit that causes them.
 *
 * ── The shape every rule here shares ────────────────────────────────────────
 *
 * Each check exists because something came up GREEN while being wrong. That is
 * the only class this file is for. A container that crashes is already loud; a
 * container that is healthy, passes its health check, and answers 404 or
 * ECONNREFUSED on everything else is not, and it has cost this repo several
 * sessions each time. Checks 5 and 6 came from exactly that, and 7–10 below
 * cover the variants they still let through — a database role that was never
 * created, a schema no runner migrates, a hostname that does not resolve, and a
 * dev fallback pointing at a live service that answers a different API.
 *
 * If you add a rule, say WHY in the code. A gate whose reasoning is elsewhere
 * gets deleted by the next person who hits it at an inconvenient moment.
 *
 * Exit 0 = the workspace, the image and the fleet agree.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';

const ROOT = process.cwd();

/** Every workspace package that produces a deployable service. */
function servicesInRepo() {
  const dir = join(ROOT, 'services');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'package.json')))
    .map((d) => d.name)
    .sort();
}

/** Every workspace directory under `dir` that carries a package.json. */
function workspacesUnder(dir) {
  const root = join(ROOT, dir);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, 'package.json')))
    .map((d) => d.name)
    .sort();
}

const packagesInRepo = () => workspacesUnder('packages');
const appsInRepo = () => workspacesUnder('apps');

function read(file) {
  const path = join(ROOT, file);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/** How many `.sql` migration files a service ships, or 0 if it has no migration directory. */
function migrationCount(svc) {
  const dir = join(ROOT, 'services', svc, 'drizzle');
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).length;
}

const services = servicesInRepo();
const failures = [];

// ── 1 · the image can install every workspace ───────────────────────────────
//
// This checked `services/` only, and on 2026-08-02 that gap broke the image
// build on `main`: `packages/venue-contracts` was added without its COPY line,
// so pnpm installed it as a workspace with no dependencies, `ledger-client`
// never linked, and the build died with
//
//   Cannot find module '@intafaced/ledger-client/money'
//
// plus a nonsense `number`/`bigint` comparison error downstream, because the
// missing module made `Amount` resolve to something else. Neither error names
// the Dockerfile. The gate that exists to catch exactly this was looking at the
// wrong half of the workspace.
//
// A package is no less required than a service — arguably more, since every
// service imports several. So both are checked.
const dockerfile = read('Dockerfile');
if (dockerfile === null) {
  failures.push({ file: 'Dockerfile', reason: 'missing entirely' });
} else {
  const workspaces = [
    ...services.map((name) => `services/${name}`),
    ...packagesInRepo().map((name) => `packages/${name}`),
    ...appsInRepo().map((name) => `apps/${name}`),
  ];

  for (const ws of workspaces) {
    if (!dockerfile.includes(`${ws}/package.json`)) {
      failures.push({
        file: 'Dockerfile',
        reason: `no COPY for ${ws}/package.json — pnpm will install it as if it had no dependencies, and the build fails later with a misleading "cannot find module" that never names this file`,
      });
    }
  }
}

// ── 2 · the fleet actually runs every service ───────────────────────────────
const compose = read('docker-compose.apps.yml');
if (compose === null) {
  failures.push({ file: 'docker-compose.apps.yml', reason: 'missing entirely' });
} else {
  for (const svc of services) {
    // A service may legitimately be absent if it is not deployable, but that
    // must be a decision someone wrote down rather than an oversight.
    if (!new RegExp(`^\\s{2}${svc}:`, 'm').test(compose) && !compose.includes(`# no-deploy: ${svc}`)) {
      failures.push({
        file: 'docker-compose.apps.yml',
        reason: `no service block for ${svc} — it will never start. If that is deliberate, add a "# no-deploy: ${svc}" comment saying why`,
      });
    }
  }
}

// ── 3 · a service that mounts /trpc gets the secret it cannot boot without ──
// `edgeEnvSchema` has NO default, by design: a service that cannot authenticate
// the edge must refuse to start rather than serve every caller as anonymous.
// So a missing secret is a crash loop, not a warning.
if (compose !== null) {
  for (const svc of services) {
    const env = read(`services/${svc}/src/env.ts`);
    if (!env?.includes('edgeEnvSchema')) continue;

    const block = new RegExp(`^  ${svc}:([\\s\\S]*?)(?=^  \\S|\\Z)`, 'm').exec(compose);
    if (block && !block[1].includes('edge-secret')) {
      failures.push({
        file: 'docker-compose.apps.yml',
        reason: `${svc} merges edgeEnvSchema but its compose block does not receive *edge-secret — it will crash-loop on EDGE_PRINCIPAL_SECRET`,
      });
    }
  }
}

// ── 4 · no two services claim the same host port ────────────────────────────
// Docker does not detect this until the second container tries to bind, so the
// fleet comes up MOSTLY working and one service is missing — which reads like
// that service crashed rather than like a config clash. svc-dex and svc-indexer
// both claimed 4013 and only the second one to start failed.
if (compose !== null) {
  const claimed = new Map();
  const re = /^  ([a-z0-9-]+):([\s\S]*?)(?=^  \S|\Z)/gm;
  for (const [, name, body] of compose.matchAll(re)) {
    for (const [, host] of body.matchAll(/ports: \['(\d+):/g)) {
      if (claimed.has(host)) {
        failures.push({
          file: 'docker-compose.apps.yml',
          reason: `port ${host} is claimed by both ${claimed.get(host)} and ${name} — whichever starts second fails to bind, and it looks like a crash rather than a clash`,
        });
      } else {
        claimed.set(host, name);
      }
    }
  }
}

// ── 5 · EVERY service calls each other on the port it actually listens on ───
// Nothing catches this until a request fails at runtime with ECONNREFUSED, and
// the fleet looks entirely healthy meanwhile: every container is up, every
// health check passes, and only the proxied call fails. Five of ten upstream
// URLs were wrong at once because the route table was written from memory
// rather than read from the compose.
//
// This originally inspected only svc-edge's own environment block, on the
// assumption that the edge is where cross-service URLs live. It is not:
// svc-dex called svc-indexer on 4012 when it listens on 4013, that URL sat in
// svc-dex's block, and the gate stayed green through the whole thing. Any
// service may name any other, so every block is checked.
if (compose !== null) {
  const listens = new Map();
  for (const [, name, body] of compose.matchAll(/^  (svc-[a-z0-9-]+):([\s\S]*?)(?=^  \S|\Z)/gm)) {
    const port = /HTTP_PORT: '(\d+)'/.exec(body);
    if (port) listens.set(name, port[1]);
  }

  for (const [, caller, body] of compose.matchAll(/^  ([a-z0-9-]+):([\s\S]*?)(?=^  \S|\Z)/gm)) {
    for (const [, varName, svc, port] of body.matchAll(/(\w+_URL): http:\/\/(svc-[a-z0-9-]+):(\d+)/g)) {
      const real = listens.get(svc);
      if (real && real !== port) {
        failures.push({
          file: 'docker-compose.apps.yml',
          reason: `${caller} calls ${svc} on ${port} via ${varName}, but ${svc} listens on ${real} — every request through that route fails while both containers report healthy`,
        });
      }
    }
  }
}

// ── 6 · a mounted service the edge cannot reach ─────────────────────────────
// svc-indexer mounted its router correctly and answered on its own port, but
// the edge had no route to it, so every call 404'd at the door. From outside,
// that is indistinguishable from the service being broken — and from inside,
// the service looks perfect. A service reachable only from within the compose
// network is not reachable.
if (compose !== null) {
  const edgeBlock = /^  svc-edge:([\s\S]*?)(?=^  \S|\Z)/m.exec(compose);
  const edgeEnv = edgeBlock?.[1] ?? '';
  const routes = read('services/svc-edge/src/routes.ts') ?? '';

  for (const svc of services) {
    const index = read(`services/${svc}/src/index.ts`);
    // Only services that actually serve a router need a route to them.
    if (!index?.includes('register(fastifyTRPCPlugin')) continue;
    if (svc === 'svc-edge') continue;

    /**
     * Read the ROUTE ENTRIES, not the first brace pair that mentions the name.
     *
     * This previously ran `new RegExp('\\{[^}]*<name>[^}]*\\}')` across the whole
     * file and took the first hit. That matches ANY brace pair — including the
     * `Upstream` interface and the comments inside it. As soon as a comment near
     * the top mentioned `trade` (#186 added one explaining the new `module`
     * field), the check matched that block, found no `envVar`, and reported
     * "svc-trade mounts a tRPC router but has no entry in UPSTREAMS" — while the
     * entry sat plainly at line 62 and the edge answered 200 for it.
     *
     * It went red on `main` for everyone, on prose. A gate that fails on a
     * comment is worse than no gate, because it teaches people to ignore it —
     * and the next failure it reports will be a real one.
     *
     * So: consider only brace pairs that ASSIGN `envVar` a string literal —
     * `envVar: '…'`. Note the quote is load-bearing. My first attempt matched
     * `envVar:` alone, which still selected the `Upstream` interface, because
     * the interface *declares* `readonly envVar: string`. A value has quotes; a
     * type does not. That distinction is the whole check.
     */
    const entries = routes.match(/\{[^{}]*envVar: '[^{}]*\}/g) ?? [];
    const needle = svc.replace('svc-', '').toLowerCase();
    const entry = entries.find((e) => e.toLowerCase().includes(needle));
    const envVar = /envVar: '(\w+)'/.exec(entry ?? '')?.[1];

    if (!envVar) {
      failures.push({
        file: 'services/svc-edge/src/routes.ts',
        reason: `${svc} mounts a tRPC router but has no entry in UPSTREAMS — callers get a 404 from the edge while the service itself is healthy and answering`,
      });
    } else if (!edgeEnv.includes(`${envVar}:`)) {
      failures.push({
        file: 'docker-compose.apps.yml',
        reason: `svc-edge's route table names ${envVar} for ${svc}, but its compose block does not set it — the edge falls back to a localhost dev URL that resolves to the edge container itself`,
      });
    }
  }
}

// ── 7 · a service with a database has a role that actually exists ───────────
// `tooling/infra/postgres-init/01-service-schemas.sql` creates one role and one
// schema per service — but Postgres runs `/docker-entrypoint-initdb.d` ONLY on
// an EMPTY data directory. So adding a service to that array does nothing for
// anyone whose volume already exists, and FORGETTING to add it does nothing
// visible until a clean clone.
//
// The failure it produces is the reason this check is worth its length: the
// role does not exist, so `postgres://svc_newthing:svc_newthing@…` comes back
// as `28P01` — which the driver reports as a PASSWORD authentication failure.
// Everyone who reads that goes looking for a wrong credential in compose. The
// credential is right; the account it names was never created. That mistake
// has an entire onboarding session's worth of cost attached to it.
//
// Static, at the commit, before anyone builds a volume around it.
const initSql = read('tooling/infra/postgres-init/01-service-schemas.sql');
const composeRoles = new Map(); // svc-name -> role named in its DATABASE_URL
if (compose !== null) {
  for (const [, name, body] of compose.matchAll(/^  ([a-z0-9-]+):([\s\S]*?)(?=^  \S|\Z)/gm)) {
    const role = /DATABASE_URL: postgres:\/\/([a-z0-9_]+):/.exec(body)?.[1];
    if (role) composeRoles.set(name, role);
  }
}
if (initSql === null) {
  if (composeRoles.size > 0) {
    failures.push({
      file: 'tooling/infra/postgres-init/01-service-schemas.sql',
      reason:
        'missing entirely, but compose names database roles — every service with a DATABASE_URL would fail to authenticate on a clean clone',
    });
  }
} else {
  // The array holds the SUFFIX (`'identity'`), the URL holds the full role
  // (`svc_identity`). Compare on the full name so a typo in either is caught.
  const declared = new Set([...initSql.matchAll(/'([a-z0-9_]+)'/g)].map(([, s]) => (s.startsWith('svc_') ? s : `svc_${s}`)));
  for (const [svc, role] of composeRoles) {
    if (!declared.has(role)) {
      failures.push({
        file: 'tooling/infra/postgres-init/01-service-schemas.sql',
        reason: `${svc} connects as "${role}" but that role is not in the bootstrap array — on a clean clone the role does not exist and the connection fails with 28P01, which reads as a wrong PASSWORD rather than a missing account`,
      });
    }
  }
}

// ── 8 · a service with a schema has a migration, and it is actually run ─────
// Three separate places have to agree before a service's tables exist:
// compose gives it a DATABASE_URL, `tooling/infra/migrate-all.mjs` lists it, and
// the service ships migration files. Any two out of three is silent.
//
// Missing from migrate-all: the migration never runs, so the schema is empty,
// and the service's boot assertion (`SELECT 1 FROM <schema>.<table>`, which
// every service with a database performs) fails with "relation does not exist"
// — read by everyone as a broken query in the service, not as a runner that was
// never asked to run.
//
// The reverse is quieter still: migration files with no DATABASE_URL in compose
// means someone wrote a schema that the fleet will never create, and nothing
// fails at all until the first query.
const migrateAll = read('tooling/infra/migrate-all.mjs') ?? '';
for (const svc of services) {
  const hasUrl = composeRoles.has(svc);
  const migrations = migrationCount(svc);

  if (hasUrl && migrations === 0) {
    failures.push({
      file: `services/${svc}/drizzle`,
      reason: `${svc} is given a DATABASE_URL but ships no migration — its schema stays empty and its boot assertion fails with "relation does not exist", which reads as a broken query rather than a missing migration`,
    });
  }
  if (hasUrl && !migrateAll.includes(`'${svc}'`)) {
    failures.push({
      file: 'tooling/infra/migrate-all.mjs',
      reason: `${svc} has a DATABASE_URL but is not in the SERVICES list — the migrate container exits 0 without touching its schema, and every service gated on service_completed_successfully starts anyway`,
    });
  }
  if (!hasUrl && migrations > 0) {
    failures.push({
      file: 'docker-compose.apps.yml',
      reason: `${svc} ships ${migrations} migration(s) but its compose block sets no DATABASE_URL — those tables are never created in the fleet`,
    });
  }
}

// ── 9 · a *_URL that names a service the fleet does not contain ─────────────
// Check 5's blind spot, and it is the same shape as the bug that widened it.
// That check compares the port in a `*_URL` against the port the named service
// listens on — but it can only do that for a service it can FIND. When the name
// is wrong, or the service was renamed, `listens` has no entry and check 5 says
// nothing at all.
//
// The runtime symptom is worse than a wrong port, not better: a wrong port is
// ECONNREFUSED from a host that exists, while a wrong NAME does not resolve in
// the compose network at all. Both containers stay healthy either way, so the
// fleet is green and only the calls fail.
if (compose !== null) {
  const known = new Set([...compose.matchAll(/^  ([a-z0-9-]+):/gm)].map(([, n]) => n));

  for (const [, caller, body] of compose.matchAll(/^  ([a-z0-9-]+):([\s\S]*?)(?=^  \S|\Z)/gm)) {
    for (const [, varName, svc] of body.matchAll(/(\w+_URL): http:\/\/(svc-[a-z0-9-]+):\d+/g)) {
      if (!known.has(svc)) {
        failures.push({
          file: 'docker-compose.apps.yml',
          reason: `${caller} calls "${svc}" via ${varName}, but no service by that name exists in this compose — the hostname does not resolve, so every request through that route fails while both containers report healthy`,
        });
      }
    }
  }
}

// ── 10 · every edge route has a URL, in BOTH the places one can be wrong ────
// Check 6 arrives at the env var from the service side, by matching a service
// name against the route table. That works for the services it can match and is
// blind to any UPSTREAMS row it cannot — a prefix whose service was renamed, or
// one that fans out to a path rather than a service. Walking UPSTREAMS itself is
// exhaustive by construction, which is the property that matters in a gate.
//
// The `devUrl` half is the literal bug that produced check 5: INDEXER_URL named
// 4012 while svc-indexer listens on 4013. Compose is now guarded against that;
// `devUrl` is not, and it is what a developer running the edge OUTSIDE compose
// actually hits. A dev fallback pointing at the wrong port is a live service
// answering a DIFFERENT API — which does not fail cleanly, it answers wrongly.
//
// An unset env var is reported by both 6 and 10, from the two directions. That
// duplication is deliberate: neither check subsumes the other (6 also catches a
// mounted service with NO route table entry, which 10 cannot see), so deleting
// either to silence the second line reopens a gap.
if (compose !== null) {
  const edgeBlock = /^  svc-edge:([\s\S]*?)(?=^  \S|\Z)/m.exec(compose);
  const edgeEnv = edgeBlock?.[1] ?? '';
  const routes = read('services/svc-edge/src/routes.ts');

  if (routes === null) {
    failures.push({ file: 'services/svc-edge/src/routes.ts', reason: 'missing entirely — the front door has no route table' });
  } else {
    for (const [, prefix, envVar, devUrl] of routes.matchAll(/\{\s*prefix: '([^']+)',\s*envVar: '(\w+)',\s*devUrl: '([^']+)'/g)) {
      const deployed = new RegExp(`${envVar}: http://(svc-[a-z0-9-]+):(\\d+)`).exec(edgeEnv);
      if (!deployed) {
        failures.push({
          file: 'docker-compose.apps.yml',
          reason: `svc-edge routes ${prefix} via ${envVar}, but its compose block does not set it — the edge falls back to ${devUrl}, a localhost URL that inside the container resolves to the edge itself`,
        });
        continue;
      }
      const devPort = /:(\d+)/.exec(devUrl)?.[1];
      if (devPort && devPort !== deployed[2]) {
        failures.push({
          file: 'services/svc-edge/src/routes.ts',
          reason: `${envVar}'s dev fallback is ${devUrl} but compose points it at ${deployed[1]}:${deployed[2]} — one of the two is wrong, and running the edge outside compose would reach whatever else holds port ${devPort}`,
        });
      }
    }
  }
}

// ── 7 · a user-facing app that cannot be run ────────────────────────────────
//
// The failure this exists for, in full, because it cost four days:
//
// The vendored trading shell is the stated product — 74 screens, and the
// direction has always been that our features go on top of it. It had no
// `dist`, no Dockerfile and no compose entry. The only way to see it was
// `npm run dev` by hand. Documents sent readers to `:8090`; nothing ever served
// that port.
//
// So one developer put 48 commits into it WITHOUT EVER SEEING IT RENDER, while
// a different app — added two days before the shell was vendored — stayed on
// :3000 as the de-facto product purely because it was the only one that
// started. Nobody chose that. It is what happens when the intended thing cannot
// be run and the unintended thing can.
//
// No gate caught it, because every gate here asked "does this service reach the
// fleet?" and a front-end is not a service.
//
// So: a directory with a build script and an index.html or a Next config is a
// user-facing app, and it either appears in compose or carries a written
// `# no-deploy:` reason. Silence is the thing being forbidden.
{
  const composeApps = read('docker-compose.apps.yml') ?? '';
  const frontends = [
    ...workspacesUnder('apps').map((n) => ({ name: n, dir: join('apps', n) })),
    { name: '05_Web_Front', dir: join('vendor', 'coinexchange', '05_Web_Front') },
  ];

  for (const fe of frontends) {
    if (!existsSync(join(ROOT, fe.dir, 'package.json'))) continue;
    const pkg = JSON.parse(readFileSync(join(ROOT, fe.dir, 'package.json'), 'utf8'));
    if (!pkg.scripts?.build) continue;

    // `\s` inside a template literal is just the letter s — the first version
    // of this line matched nothing and flagged apps/admin, which is plainly in
    // the file. A gate that cries wolf gets switched off, and then the real
    // failure it was written for goes through it unnoticed.
    const named =
      composeApps.includes(fe.dir.split(sep).join('/')) || new RegExp(`^\\s{2}${fe.name}:`, 'm').test(composeApps);
    if (!named && !composeApps.includes(`# no-deploy: ${fe.name}`)) {
      failures.push({
        file: 'docker-compose.apps.yml',
        reason: `${fe.dir} builds a user-facing app but nothing in the fleet serves it — so it can be worked on for weeks without anyone seeing it, while whichever app DOES start becomes the product by default. If that is deliberate, add "# no-deploy: ${fe.name}" saying why`,
      });
    }
  }
}

if (failures.length === 0) {
  console.log(`  ✓ workspace-sync clean — ${services.length} service(s) reach both the image and the fleet`);
  process.exitCode = 0;
} else {
  console.error(`  ✖ workspace-sync — ${failures.length} problem(s)`);
  for (const f of failures) console.error(`        · ${f.file}: ${f.reason}`);
  console.error('\n  A service that exists but does not deploy is not shipped (Doctrine §0.1).');
  process.exitCode = 1;
}
