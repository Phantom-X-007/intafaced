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
 * Exit 0 = the workspace, the image and the fleet agree.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

function read(file) {
  const path = join(ROOT, file);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

const services = servicesInRepo();
const failures = [];

// ── 1 · the image can install every workspace ───────────────────────────────
const dockerfile = read('Dockerfile');
if (dockerfile === null) {
  failures.push({ file: 'Dockerfile', reason: 'missing entirely' });
} else {
  for (const svc of services) {
    if (!dockerfile.includes(`services/${svc}/package.json`)) {
      failures.push({
        file: 'Dockerfile',
        reason: `no COPY for services/${svc}/package.json — pnpm will install it as if it had no dependencies, and the build fails later with a misleading "cannot find module"`,
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

    const envVar = /envVar: '(\w+)'/.exec(
      new RegExp(`\\{[^}]*${svc.replace('svc-', '')}[^}]*\\}`, 'i').exec(routes)?.[0] ?? '',
    )?.[1];

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

if (failures.length === 0) {
  console.log(`  ✓ workspace-sync clean — ${services.length} service(s) reach both the image and the fleet`);
  process.exitCode = 0;
} else {
  console.error(`  ✖ workspace-sync — ${failures.length} problem(s)`);
  for (const f of failures) console.error(`        · ${f.file}: ${f.reason}`);
  console.error('\n  A service that exists but does not deploy is not shipped (Doctrine §0.1).');
  process.exitCode = 1;
}
