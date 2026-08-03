#!/usr/bin/env node
/**
 * COMPOSE SECRET PARITY — every secret a service refuses to boot without is
 * actually supplied to that service's container.
 *
 * WHY THIS EXISTS, and it is a short story with two identical halves.
 *
 * `svc-ledger` merges `authEnvSchema`, so `JWT_ACCESS_SECRET` is required with
 * no default. Its block in `docker-compose.apps.yml` never set it. The service
 * crash-looped on `JWT_ACCESS_SECRET: Required` (#431).
 *
 * The interesting part is not the missing line. It is WHY nobody noticed for so
 * long: **a running container keeps the environment it started with.** The
 * fleet was healthy, `docker ps` was green, and the defect was latent until an
 * unrelated `up` recreated the container. A secret that is missing but not yet
 * fatal is invisible until the next deploy — which is to say, it surfaces at the
 * worst possible moment, during a change, while somebody is looking at something
 * else.
 *
 * That is not a bug you fix once. It is a bug you make impossible. Writing this
 * check found the second one immediately: `svc-academy` merges
 * `internalServiceEnvSchema` and its compose block supplied only the edge
 * secret. Same defect, same latency, not yet triggered.
 *
 * It matters most during a ROTATION. Rotating a shared secret means editing
 * every consumer; getting three of four is the same failure with a worse blast
 * radius, and the fourth service will not tell you until it restarts. See
 * docs/SECRET-ROTATION-READINESS-2026-08-03.md for the blast-radius map this
 * check mechanises.
 *
 * WHAT IT DOES NOT DO: it never reads a secret's value, and it never asserts a
 * secret is *set* — `${VAR:?…}` already makes compose refuse to start for that.
 * It asserts only that the WIRING exists: schema requires it, compose passes it.
 *
 * Exit 0 = every required secret is wired. Exit 1 = a service would crash-loop
 * on its next container recreate.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();
const COMPOSE = 'docker-compose.apps.yml';

/** Secret-shaped env var names. Deliberately the same shape the scan uses. */
const SECRET_VAR = /(?:^|_)(?:SECRET|PASSWORD|TOKEN|PRIVATE_KEY|API_KEY|CREDENTIAL)S?$/;

/**
 * A zod field that is REQUIRED — no `.optional()` and no `.default(…)`. Those
 * two are the whole distinction this check turns on: an optional secret that is
 * absent degrades a feature, a required one stops the process.
 */
const isRequired = (chain) => !/\.optional\s*\(/.test(chain) && !/\.default\s*\(/.test(chain);

/**
 * Pull `KEY: z.string()…` declarations out of a chunk of TypeScript, keeping
 * only the secret-shaped, required ones.
 *
 * A regex rather than a TS parse, and the trade is stated: the failure mode is a
 * MISSED requirement, never a false alarm.
 *
 * `joinChains` exists because the first draft DID miss one. Prettier wraps long
 * zod chains onto their own lines:
 *
 *     PAY_CRYPTO_HOT_WALLET_KEY: z
 *       .string()
 *       .regex(…)
 *       .optional(),
 *
 * and a line-bounded regex sees `z` and stops, so the `.optional()` — or worse,
 * its absence — is invisible. Re-joining continuation lines first costs one
 * replace and removes the whole class.
 */
const joinChains = (source) => source.replace(/\n\s*\./g, '.');

function requiredSecretsIn(source) {
  const found = new Set();
  const re = /([A-Z][A-Z0-9_]*)\s*:\s*(z\.[^,\n]*)/g;
  let m;
  while ((m = re.exec(joinChains(source))) !== null) {
    const [, key, chain] = m;
    if (!SECRET_VAR.test(key)) continue;
    if (!isRequired(chain)) continue;
    found.add(key);
  }
  return found;
}

// ── 1 · what each shared slice in packages/config requires ───────────────────
// Derived, not hardcoded: a new secret added to an existing slice is picked up
// without anyone remembering to update this file.
const configSrc = readFileSync(join(ROOT, 'packages/config/src/env.ts'), 'utf8');
const slices = new Map();
for (const m of configSrc.matchAll(/export const (\w+EnvSchema)\s*=\s*z\.object\(\{([\s\S]*?)\n\}\)/g)) {
  slices.set(m[1], requiredSecretsIn(m[2]));
}
// `serviceEnvSchema` is a composition of other slices; expand it the same way.
const composed = /export const serviceEnvSchema\s*=([\s\S]*?);/.exec(configSrc);
if (composed) {
  const union = new Set();
  for (const s of composed[1].matchAll(/(\w+EnvSchema)/g)) for (const v of slices.get(s[1]) ?? []) union.add(v);
  slices.set('serviceEnvSchema', union);
}

// ── 2 · what each service requires ───────────────────────────────────────────
const serviceEnvFiles = execFileSync('git', ['ls-files', 'services/*/src/env.ts'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const required = new Map();
for (const rel of serviceEnvFiles) {
  const name = rel.split('/')[1];
  const src = joinChains(readFileSync(join(ROOT, rel), 'utf8'));
  const need = new Set();

  // Slices this service merges, including ones passed to a bare compose call.
  for (const m of src.matchAll(/(\w+EnvSchema)/g)) for (const v of slices.get(m[1]) ?? []) need.add(v);

  // Inline declarations in the service's own z.object — these can also RELAX a
  // slice (svc-ws redeclares JWT_ACCESS_SECRET as `.optional()`), so a
  // non-required inline declaration removes the requirement.
  const inlineRe = /([A-Z][A-Z0-9_]*)\s*:\s*(z\.[^,\n]*)/g;
  let m;
  while ((m = inlineRe.exec(src)) !== null) {
    const [, key, chain] = m;
    if (!SECRET_VAR.test(key)) continue;
    if (isRequired(chain)) need.add(key);
    else need.delete(key);
  }
  required.set(name, need);
}

// ── 3 · what compose supplies ────────────────────────────────────────────────
const composePath = join(ROOT, COMPOSE);
if (!existsSync(composePath)) {
  console.error(`✖ compose-secret-parity — ${COMPOSE} not found`);
  process.exit(1);
}
const composeLines = readFileSync(composePath, 'utf8').split(/\r?\n/);

/** Top-level `x-…: &anchor` blocks and the variable names they carry. */
const anchorVars = new Map();
{
  let anchor = null;
  for (const line of composeLines) {
    const decl = /^x-[\w-]+:\s*&([\w-]+)\s*$/.exec(line);
    if (decl) {
      anchor = decl[1];
      anchorVars.set(anchor, new Set());
      continue;
    }
    if (/^\S/.test(line)) anchor = null; // left the block
    if (!anchor) continue;
    const kv = /^\s{2}([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(line);
    if (kv) anchorVars.get(anchor).add(kv[1]);
  }
}

/** Per compose service: the vars inside its `environment:` block only. */
const supplied = new Map();
{
  let svc = null;
  let inEnv = false;
  for (const line of composeLines) {
    const svcDecl = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (svcDecl) {
      svc = svcDecl[1];
      inEnv = false;
      supplied.set(svc, new Set());
      continue;
    }
    if (!svc) continue;
    if (/^ {4}\S/.test(line)) inEnv = /^ {4}environment:/.test(line);
    if (!inEnv) continue;

    // `<<: [*a, *b]` or `<<: *a` — only counted inside environment:
    const merge = /^\s*<<:\s*(?:\[([^\]]+)\]|\*([\w-]+))/.exec(line);
    if (merge) {
      const names = merge[1] ? merge[1].split(',') : [merge[2]];
      for (const raw of names) for (const v of anchorVars.get(raw.trim().replace(/^\*/, '')) ?? []) supplied.get(svc).add(v);
      continue;
    }
    const kv = /^ {6}([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(line);
    if (kv) supplied.get(svc).add(kv[1]);
  }
}

// ── 4 · compare ──────────────────────────────────────────────────────────────
const gaps = [];
const notDeployed = [];
for (const [svc, need] of required) {
  if (!supplied.has(svc)) {
    if (need.size > 0) notDeployed.push(svc);
    continue;
  }
  const missing = [...need].filter((v) => !supplied.get(svc).has(v)).sort();
  if (missing.length > 0) gaps.push({ svc, missing });
}

if (gaps.length > 0) {
  console.error(`\n✖ COMPOSE SECRET PARITY FAILED — ${gaps.length} service(s) would crash-loop on their next container recreate\n`);
  for (const { svc, missing } of gaps) {
    console.error(`  ${svc} — declares but is never given: ${missing.join(', ')}`);
    for (const v of missing) {
      if (v === 'EDGE_PRINCIPAL_SECRET') console.error('      add `*edge-secret` to its `environment:` merge list');
      else if (v === 'INTERNAL_SERVICE_SECRET') console.error('      add `*internal-secret` to its `environment:` merge list');
      else console.error(`      add \`${v}: \${${v}:?missing — copy .env.example to .env}\` to its environment block`);
    }
    console.error('');
  }
  console.error('  A running container keeps the environment it started with, so this does NOT');
  console.error('  show up as a failure today — it shows up during the next deploy, or the next');
  console.error('  secret rotation, which is when nobody is looking for it. That is how #431');
  console.error(`  hid. Blast-radius map: docs/SECRET-ROTATION-READINESS-2026-08-03.md\n`);
  process.exit(1);
}

const checked = [...required.values()].reduce((n, s) => n + s.size, 0);
console.log(
  `✓ compose-secret-parity — ${checked} required secret binding(s) across ${supplied.size} compose service(s) wired` +
    (notDeployed.length > 0 ? `; ${notDeployed.length} service(s) not in ${COMPOSE}` : ''),
);
