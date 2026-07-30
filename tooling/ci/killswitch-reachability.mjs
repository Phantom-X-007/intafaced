#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * KILL-SWITCH REACHABILITY — §14.6, machine-checked.
 *
 * The DoD gate listed "Kill-switch verified reachable from `apps/admin`" as a
 * MANUAL sign-off item. Manual is how it stayed false for so long: every piece
 * of the platform's kill-switch machinery existed and was correct, and none of
 * it was connected to anything.
 *
 *   · `packages/config/src/flags.ts` modelled `disabledModules` from the start.
 *   · `svc-protocol` exported `setRelayEnabled`, `svc-indexer` exported
 *     `setIngestEnabled`, both commented "the kill-switch surface `apps/admin`
 *     reaches" — module-scope functions callable from no other process.
 *   · `svc-ledger` built the money-plane freeze properly: a durable
 *     `posting_freeze` row, an `actor` column, a `posting_freeze_attributed_ck`
 *     constraint, and `admin:treasury` on the procedures. Then never mounted the
 *     router, so nothing could call them.
 *   · `apps/admin` printed "Staged changes are held in this browser session and
 *     have not been sent anywhere", and `operator-commands.ts` said of the
 *     ledger controls: "They do NOT call them."
 *
 * A checkbox cannot catch that. Each assertion below is one specific way the
 * wire can be cut again, chosen because it HAS been cut that way.
 *
 * Deliberately structural rather than behavioural: the behaviour is proved by
 * `services/svc-edge/src/control-plane.e2e.test.ts`, which pulls the switch over
 * real HTTP and watches the platform refuse. This script's job is to fail if
 * that proof stops existing.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const failures = [];

const read = (...parts) => {
  const file = join(ROOT, ...parts);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
};

/**
 * Is `name(app…)` actually CALLED, rather than merely mentioned?
 *
 * The first version of this script tested the raw source with a regex, and a
 * negative test caught it out immediately: commenting the call out left the
 * text on the line, the regex still matched, and the gate reported the switch
 * wired while it was not. Which is precisely the class of failure this whole
 * file exists to catch — a control that looks present and is not.
 *
 * So comment lines are dropped before the test. Block comments are handled the
 * same way; both files this is used on are ordinary TypeScript with
 * conventional formatting, and the check is deliberately narrow rather than a
 * parser.
 */
const callsWithApp = (source, name) => {
  let inBlock = false;
  return source.split('\n').some((raw) => {
    const line = raw.trim();
    if (inBlock) {
      if (line.includes('*/')) inBlock = false;
      return false;
    }
    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlock = true;
      return false;
    }
    if (line.startsWith('//') || line.startsWith('*')) return false;
    return new RegExp(`(^|[^\\w.])${name}\\s*\\(\\s*app`).test(line);
  });
};

// ── 1 · No route can be un-killable ─────────────────────────────────────────
//
// `/api/v1` is the public CCXT REST contract and forwards to svc-trade, but the
// prefix does not spell "trade". A kill-switch map derived from the prefix
// STRING left it unmapped, so halting `trade` refused the tRPC order path while
// `POST /api/v1/orders` kept taking new risk — with the console showing
// "trade: killed" throughout.
const routes = read('services', 'svc-edge', 'src', 'routes.ts');
if (!routes) {
  failures.push('services/svc-edge/src/routes.ts is missing — the edge route table is where killability is decided');
} else {
  const entries = [...routes.matchAll(/\{\s*prefix:\s*'([^']+)'([^}]*)\}/g)];
  if (entries.length === 0) {
    failures.push('services/svc-edge/src/routes.ts declares no upstreams — the route table could not be parsed');
  }
  for (const [, prefix, rest] of entries) {
    if (!/\bmodule:\s*'[^']+'/.test(rest)) {
      failures.push(
        `svc-edge route "${prefix}" declares no \`module\` — it could never be killed (§14.6). ` +
          'State the module explicitly; do not derive it from the prefix.',
      );
    }
  }
}

// ── 2 · The switch is enforced at the door, and fails closed ────────────────
const controlPlane = read('services', 'svc-edge', 'src', 'control-plane.ts');
if (!controlPlane) {
  failures.push('services/svc-edge/src/control-plane.ts is missing — nothing enforces the operator kill-switch');
} else {
  if (!/addHook\(\s*'onRequest'/.test(controlPlane)) {
    failures.push(
      'the kill-switch is not an `onRequest` hook in control-plane.ts — a guard inside one handler protects that handler, not the door',
    );
  }
  // Fail closed. This is the assertion that matters most: a safety control which
  // opens when its own check errors is worse than no control at all.
  if (!/catch[\s\S]{0,200}refused:\s*true/.test(controlPlane)) {
    failures.push('control-plane.ts does not refuse when the kill-switch check throws — a safety control MUST fail closed (§14.6)');
  }
  if (!/registerAdminRoutes/.test(controlPlane)) {
    failures.push('control-plane.ts registers no admin routes — apps/admin would have nothing to reach');
  }
}

// ── 3 · The edge actually registers both, from the same module ──────────────
//
// If `index.ts` re-implemented the routes inline, the e2e suite would verify a
// parallel copy of the rule and the deployed process would run an unverified one.
const edgeIndex = read('services', 'svc-edge', 'src', 'index.ts');
if (!edgeIndex) {
  failures.push('services/svc-edge/src/index.ts is missing');
} else {
  for (const fn of ['registerKillSwitchGuard', 'registerAdminRoutes']) {
    if (!callsWithApp(edgeIndex, fn)) {
      failures.push(`svc-edge/src/index.ts never calls ${fn}(app, …) — the control plane is not wired into the running edge`);
    }
  }
}

// ── 4 · The operator control plane is authorised ────────────────────────────
//
// An operator control any authenticated user can reach is not a control.
const adminApi = read('services', 'svc-edge', 'src', 'admin-api.ts');
if (!adminApi) {
  failures.push('services/svc-edge/src/admin-api.ts is missing — the control plane has no authorisation');
} else {
  for (const scope of ['admin:write', 'admin:treasury']) {
    if (!adminApi.includes(scope)) {
      failures.push(`svc-edge/src/admin-api.ts does not require "${scope}" — halting a market and halting the money plane are different authorities`);
    }
  }
  if (!/requireMfa|INTERACTIVE_ONLY/.test(adminApi)) {
    failures.push('svc-edge/src/admin-api.ts enforces no second factor on operator actions (§9)');
  }
}

// ── 5 · The money-plane freeze is mounted ───────────────────────────────────
//
// svc-ledger had `freeze`/`unfreeze` behind `admin:treasury` on a router that
// was exported for its TYPE and served on no port. Correct code, reachable by
// nothing.
const ledgerIndex = read('services', 'svc-ledger', 'src', 'index.ts');
if (!ledgerIndex) {
  failures.push('services/svc-ledger/src/index.ts is missing');
} else if (!callsWithApp(ledgerIndex, 'registerOperatorHttp')) {
  failures.push(
    'svc-ledger does not mount its operator surface — `posting_freeze` is durable and attributed but unreachable, ' +
      'so the platform emergency stop needs a redeploy (§4.2, §14.6)',
  );
}

// ── 6 · apps/admin can reach it ─────────────────────────────────────────────
if (!read('apps', 'admin', 'src', 'lib', 'control-plane-client.ts')) {
  failures.push('apps/admin has no control-plane client — §14.6 requires the kill-switch be reachable FROM apps/admin');
}
for (const route of ['kill-switch', 'ledger-freeze']) {
  if (!read('apps', 'admin', 'src', 'app', 'api', route, 'route.ts')) {
    failures.push(`apps/admin/src/app/api/${route}/route.ts is missing — the console cannot reach that switch`);
  }
}

// ── 7 · The behavioural proof still exists ──────────────────────────────────
//
// The asymmetry is the whole point: halting a market stops new risk, it does not
// confiscate positions, and a user must always be able to get out. Both halves
// must be asserted or the test proves half a control.
const e2e = read('services', 'svc-edge', 'src', 'control-plane.e2e.test.ts');
if (!e2e) {
  failures.push('services/svc-edge/src/control-plane.e2e.test.ts is missing — the kill-switch has no end-to-end proof');
} else {
  const required = [
    ['REFUSES a new order', 'that a halted market refuses new orders'],
    ['STILL LETS A USER CANCEL', 'that a halted market still lets a user out'],
    ['edge.kill_switch_undecidable', 'that an errored switch check behaves as engaged'],
    ['admin:treasury', 'that the money-plane freeze needs its own authority'],
    ['previous:', 'that the audit trail records the prior state'],
  ];
  for (const [needle, what] of required) {
    if (!e2e.includes(needle)) {
      failures.push(`control-plane.e2e.test.ts no longer asserts ${what} ("${needle}" not found)`);
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────────

if (failures.length > 0) {
  console.log('✖ kill-switch reachability (§14.6)');
  for (const f of failures) console.log(`    · ${f}`);
  process.exit(1);
}

console.log('✓ kill-switch reachability — every route killable, enforced at the door, fails closed, reachable from apps/admin');
