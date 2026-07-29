#!/usr/bin/env node
/**
 * DEFINITION OF DONE GATE — §14, enforced.
 *
 *   "Never half done. A module ships when its Definition of Done passes — not
 *    before, and nothing 'temporary' survives to the next phase." (§0.1)
 *
 * Run: `pnpm gate [service-name]`
 *
 * Checks, per service:
 *   1. README with API contract, event subjects, and ledger recipes used
 *   2. Zero TODOs referencing "later" without a §13 socket entry
 *   3. Migrations reversible (delegates to migration-check)
 *   4. Tests exist for every money path (a file touching ledger recipes has a
 *      sibling test)
 *   5. Observability wired — the service registers a tracer
 *   6. Admin controls — the module has a kill-switch the operator can reach
 *
 * Checks 1–6 are mechanical and run per service.
 *
 * Three of the four items that used to be a printed checklist are now checked
 * here as well — see `checkPlatformEvidence()`. They are platform-wide rather
 * than per-service, which is why they sit in their own block rather than in
 * `checkService()`.
 *
 * The fourth (i18n-keying) is still on the manual list. It is being closed on
 * `feat/app-i18n-keys`; this change deliberately does not touch it, so the two
 * edits to this file stay additive to each other.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, basename, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const SERVICES = join(ROOT, 'services');
const target = process.argv[2];

const REQUIRED_README_SECTIONS = [
  { heading: /##\s*API/i, name: 'API contract' },
  { heading: /##\s*Events/i, name: 'Event subjects' },
  { heading: /##\s*Ledger/i, name: 'Ledger recipes used' },
];

const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', 'coverage', 'drizzle', '.next']);

function* walk(dir, extensions) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full, extensions);
    else if (extensions.some((e) => name.endsWith(e))) yield full;
  }
}

function checkService(serviceDir) {
  const service = basename(serviceDir);
  const failures = [];

  // 1 · README with the three contract sections
  const readme = join(serviceDir, 'README.md');
  if (!existsSync(readme)) {
    failures.push('README.md is missing (§14: "Docs: service README with API contract, event subjects, ledger recipes used")');
  } else {
    const content = readFileSync(readme, 'utf8');
    for (const { heading, name } of REQUIRED_README_SECTIONS) {
      if (!heading.test(content)) failures.push(`README.md has no "${name}" section`);
    }
  }

  // 2 · No "later" TODOs without a §13 socket
  for (const file of walk(join(serviceDir, 'src'), ['.ts', '.tsx'])) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/\b(TODO|FIXME|HACK|XXX)\b/i.test(line)) return;
      if (!/\blater\b|\bfor now\b|\btemporar/i.test(line)) return;
      if (/§13|Section 13|SOCKET:/i.test(line)) return;
      failures.push(`${relative(ROOT, file)}:${i + 1} — deferred work with no §13 socket entry: "${line.trim().slice(0, 90)}"`);
    });
  }

  // 3 · Every module touching money has tests beside it
  const srcDir = join(serviceDir, 'src');
  const moneyFiles = [];
  for (const file of walk(srcDir, ['.ts'])) {
    if (file.includes('.test.')) continue;
    const content = readFileSync(file, 'utf8');
    // A file MOVES value if it posts to the ledger or builds a recipe.
    //
    // Merely importing `@intafaced/ledger-client` is not enough — svc-matching
    // imports it for `Amount`/`parseAmount` and posts nothing at all, so the
    // old test flagged its router as an untested money path. Widening a gate
    // until it cries wolf is how a gate gets ignored.
    if (/ledger\.post\(|recipes\.[a-zA-Z]/.test(content)) moneyFiles.push(file);
  }
  const testFiles = [...walk(srcDir, ['.test.ts'])];

  /** Relative import specifiers in a file, resolved to absolute .ts paths. */
  function importsOf(sourceFile) {
    if (!existsSync(sourceFile)) return [];
    const source = readFileSync(sourceFile, 'utf8');
    const dir = join(sourceFile, '..');
    return [...source.matchAll(/from\s+'(\.[^']+)'/g)].map((m) => resolve(dir, m[1].replace(/\.js$/, '.ts')));
  }

  /**
   * Everything reachable from the tests, following imports transitively.
   *
   * Transitive on purpose. A test that drives `bank-service.ts`, which delegates
   * to `earn/earn-service.ts`, genuinely exercises the earn money paths — and
   * requiring a direct import would be checking the shape of the call graph
   * rather than whether the code is covered.
   */
  const reachable = new Set();
  const queue = [...testFiles];
  while (queue.length > 0) {
    const current = queue.pop();
    for (const imported of importsOf(current)) {
      if (reachable.has(imported)) continue;
      reachable.add(imported);
      queue.push(imported);
    }
  }

  for (const file of moneyFiles) {
    // A money file is covered when SOME test in the service actually imports it.
    //
    // Two failure modes to avoid, and this sits between them:
    //
    //   · "any .test.ts anywhere under src/" — the original, a false green. One
    //     unrelated test satisfied the check for every money path in the
    //     service. Found by partner audit.
    //   · "a test in the same directory" — my first fix, too prescriptive. It
    //     dictates layout rather than checking coverage: svc-bank keeps its
    //     money paths in src/earn/ and src/transfers/ with one integration
    //     suite at the service root, which is a perfectly good structure and
    //     would have failed. Found by the agent building it.
    //
    // Following the import graph checks the thing we actually care about —
    // that the file is exercised — and leaves the layout to the author.
    const covered = reachable.has(file);

    if (!covered) {
      failures.push(
        `${relative(ROOT, file)} moves value but no test in this service imports it ` +
          `(§14: money paths ≥ 95% coverage). Import it from a test, or add ${basename(file, '.ts')}.test.ts.`,
      );
    }
  }

  // 4 · Observability
  const hasTracing = [...walk(srcDir, ['.ts'])].some((f) => /@opentelemetry|initTracing|withSpan/.test(readFileSync(f, 'utf8')));
  if (existsSync(srcDir) && !hasTracing) {
    failures.push('no OpenTelemetry instrumentation found (§14: traces + one SLO dashboard panel)');
  }

  // 5 · Admin kill-switch
  //
  // This was `flags.includes("'<moduleId>'")` — a substring search over the
  // whole file, which a flag KEY, a description, or an unrelated import could
  // satisfy without any kill-switch existing. A gate that can be passed by
  // coincidence is not a gate. It now parses the module argument of each
  // `def(...)` call, which is the thing that actually confers the switch.
  const flagsFile = join(ROOT, 'packages', 'config', 'src', 'flags.ts');
  if (existsSync(flagsFile)) {
    const moduleId = service.replace(/^svc-/, '');
    const flags = readFileSync(flagsFile, 'utf8');

    // def('some.key', 'module-id', …) — the second argument names the module.
    const declared = new Set([...flags.matchAll(/\bdef\(\s*'[^']+'\s*,\s*'([^']+)'/g)].map((m) => m[1]));

    if (!declared.has(moduleId)) {
      failures.push(
        `module "${moduleId}" has no flag declared against it in FLAG_REGISTRY — ` + `the operator has no kill-switch (§14 admin controls)`,
      );
    }
  }

  return { service, failures };
}

// ── Platform-wide DoD evidence (§14.3, §14.5, §14.6) ────────────────────────
//
// These three were a printed checklist for the reviewer to sign. A checklist
// signed by whoever is in a hurry is not a gate, and two of the three had in
// fact never been true: no e2e suite existed, and every "kill-switch surface
// apps/admin reaches" in the platform reached nothing.
//
// WHAT A STATIC CHECK CAN AND CANNOT PROVE, stated plainly so nobody reads more
// into a green than is there. It cannot run the fleet — `pnpm gate` must stay
// runnable on a laptop with no Docker. What it CAN do is prove that the
// evidence exists, is wired to the thing it claims to cover, and cannot be
// quietly deleted: the suite exists and names the required scenarios, CI runs
// it, and this job depends on that one. `needs: [e2e]` in the workflow is what
// turns "the suite exists" into "the suite passed" — the gate physically does
// not run otherwise.

const readIfExists = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);

/**
 * §14.3 — e2e happy path + top-3 failure paths, green in CI.
 *
 * Scenario TAGS rather than test titles. A tag is a contract between the gate
 * and the suite; a title is prose that gets reworded, and a gate that breaks on
 * a reworded sentence gets deleted. Each tag must appear in a `describe` in
 * `tooling/e2e/src/*.e2e.test.ts`.
 */
const REQUIRED_E2E_SCENARIOS = [
  { tag: 'e2e:happy.money-spine', what: 'the happy path — authenticate, deposit, place, hold, fill, ledger balances' },
  { tag: 'e2e:failure.insufficient-funds', what: 'failure path 1 — insufficient funds' },
  { tag: 'e2e:failure.market-halted', what: 'failure path 2 — a halted or closed market' },
  { tag: 'e2e:failure.unauthorized', what: 'failure path 3 — unauthenticated or under-scoped caller' },
  { tag: 'e2e:killswitch.trade-orders', what: '§14.6 — the kill-switch, proved by behaviour' },
];

function checkE2e() {
  const failures = [];
  const e2eDir = join(ROOT, 'tooling', 'e2e');
  const srcDir = join(e2eDir, 'src');

  const pkg = readIfExists(join(e2eDir, 'package.json'));
  if (!pkg) {
    failures.push('tooling/e2e/package.json is missing — there is no e2e suite (§14.3)');
    return failures;
  }
  if (!/"e2e"\s*:/.test(pkg)) failures.push('tooling/e2e/package.json declares no "e2e" script');

  const rootPkg = readIfExists(join(ROOT, 'package.json')) ?? '';
  if (!/"e2e"\s*:/.test(rootPkg)) failures.push('the root package.json has no "e2e" script — CI has nothing to call');

  const suites = [...walk(srcDir, ['.e2e.test.ts'])];
  if (suites.length === 0) {
    failures.push('no *.e2e.test.ts under tooling/e2e/src');
    return failures;
  }
  const allSuiteText = suites.map((f) => readFileSync(f, 'utf8')).join('\n');

  for (const { tag, what } of REQUIRED_E2E_SCENARIOS) {
    if (!allSuiteText.includes(`[${tag}]`)) {
      failures.push(`no e2e scenario tagged [${tag}] — ${what} is not covered (§14.3)`);
    }
  }

  // THROUGH THE FRONT DOOR, or it is not an e2e. A suite that reached a service
  // port directly would have kept passing through the entire period when the
  // edge produced a principal signature no service would accept, which is the
  // exact class of bug this suite exists to catch.
  const harness = readIfExists(join(srcDir, 'harness.ts'));
  if (!harness) {
    failures.push('tooling/e2e/src/harness.ts is missing');
  } else if (!/E2E_EDGE_URL/.test(harness)) {
    failures.push('the e2e harness does not route through svc-edge (no E2E_EDGE_URL) — §9: nothing reaches a service any other way');
  }

  // And CI must actually run it, with the gate downstream of the result.
  const workflow = readIfExists(join(ROOT, '.github', 'workflows', 'ci.yml'));
  if (!workflow) {
    failures.push('.github/workflows/ci.yml is missing — "green in CI" cannot be true');
    return failures;
  }
  if (!/run:\s*pnpm e2e\b/.test(workflow)) {
    failures.push('.github/workflows/ci.yml never runs `pnpm e2e` — the suite exists but nothing in CI executes it');
  }

  // The load-bearing line: this gate runs only if the e2e job passed.
  //
  // Sliced by indentation rather than matched with one regex over the whole
  // file. A `[\s\S]*?` across a YAML document is the kind of pattern that
  // quietly matches the wrong block after an unrelated edit, and this check is
  // the one that must not go green by accident. CRLF is normalised first —
  // .gitattributes does not force LF on workflows, and `$` anchors are not
  // worth debugging on a Windows checkout.
  const lines = workflow.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => /^ {2}dod:\s*$/.test(l));

  /** Everything indented under `dod:`, up to the next job at the same level. */
  const dodJob = [];
  for (let i = start + 1; start !== -1 && i < lines.length; i += 1) {
    const line = lines[i];
    if (/^ {2}\S/.test(line)) break; // the next job key
    dodJob.push(line);
  }

  const needs = /needs:\s*\[([^\]]*)\]/.exec(dodJob.join('\n'))?.[1] ?? '';
  if (start === -1) {
    failures.push('.github/workflows/ci.yml has no "dod" job — nothing runs this gate in CI');
  } else if (!needs.split(',').some((n) => n.trim() === 'e2e')) {
    failures.push(
      'the "dod" job in ci.yml does not `needs: [… e2e …]` — without it this gate can pass while the e2e suite is red, ' +
        'which is the checkbox it replaced',
    );
  }

  return failures;
}

/**
 * §14.6 — kill-switch reachable from `apps/admin`, and PROVED BY BEHAVIOUR.
 *
 * "An assertion that an endpoint returned 200 does not count." So the check is
 * not "a route exists": it is that the whole chain exists — console route →
 * edge control plane → a refusal on the request path — and that the e2e
 * scenario asserts both halves of §14's own worked example, the refusal AND the
 * cancel that must still work.
 */
function checkKillSwitch() {
  const failures = [];

  const edgeSwitch = readIfExists(join(ROOT, 'services', 'svc-edge', 'src', 'kill-switch.ts'));
  if (!edgeSwitch) {
    failures.push('services/svc-edge/src/kill-switch.ts is missing — nothing enforces a kill on the request path (§14.6)');
  } else {
    if (!/ALWAYS_ALLOWED_PROCEDURES/.test(edgeSwitch) || !/'cancel'/.test(edgeSwitch)) {
      failures.push(
        'svc-edge kill-switch does not exempt `cancel` — §14: "trade.spot disabled refuses new orders while still allowing ' +
          'cancels". A switch that traps funds is not a safety control.',
      );
    }
  }

  const edgeIndex = readIfExists(join(ROOT, 'services', 'svc-edge', 'src', 'index.ts')) ?? '';
  if (!/'\/admin\/kill-switches'/.test(edgeIndex)) {
    failures.push('svc-edge serves no /admin/kill-switches control plane — apps/admin has nothing to reach');
  }

  const adminRoute = readIfExists(join(ROOT, 'apps', 'admin', 'src', 'app', 'api', 'kill-switch', 'route.ts'));
  if (!adminRoute) {
    failures.push('apps/admin has no /api/kill-switch route — the operator console cannot reach the control plane (§14.6)');
  }

  const adminClient = readIfExists(join(ROOT, 'apps', 'admin', 'src', 'lib', 'kill-switch-client.ts'));
  if (!adminClient) {
    failures.push('apps/admin/src/lib/kill-switch-client.ts is missing — the console route reaches nothing');
  } else if (!/admin\/kill-switches/.test(adminClient)) {
    failures.push('the admin kill-switch client does not call svc-edge /admin/kill-switches');
  }

  // The behavioural proof. Without these two assertions the scenario could pass
  // on a 200 from a switch that changes nothing — which is what §14.6 already
  // had, in two services, for months.
  const scenario = [...walk(join(ROOT, 'tooling', 'e2e', 'src'), ['.e2e.test.ts'])]
    .map((f) => readFileSync(f, 'utf8'))
    .find((text) => text.includes('[e2e:killswitch.trade-orders]'));

  if (scenario) {
    if (!/edge\.module_killed/.test(scenario)) {
      failures.push('the kill-switch e2e never asserts a request is REFUSED (no `edge.module_killed`) — a 200 from a toggle proves nothing');
    }
    if (!/orders\.cancel/.test(scenario)) {
      failures.push('the kill-switch e2e never asserts a cancel still works while the module is killed (§14)');
    }
  }

  return failures;
}

/**
 * §14.5 — at least one SLO dashboard panel, PROVISIONED AS CODE.
 *
 * "Committed, not clicked into a running instance, which vanishes on the next
 * `down -v`." So every link in that chain is checked: a dashboard file, a
 * provider that reads the directory, a compose mount that puts the directory
 * where the provider looks, a scrape job, and — the one that catches the
 * subtlest rot — a panel whose query names a metric the code actually emits.
 */
function checkSloDashboard() {
  const failures = [];
  const grafana = join(ROOT, 'tooling', 'infra', 'grafana');
  const dashboardDir = join(grafana, 'dashboards');

  const dashboards = [...walk(dashboardDir, ['.json'])];
  if (dashboards.length === 0) {
    failures.push('no dashboard JSON under tooling/infra/grafana/dashboards — an SLO panel that is not in the repo does not exist (§14.5)');
    return failures;
  }

  /** Panel queries, across every committed dashboard. Rows carry no query and are skipped. */
  const queries = [];
  for (const file of dashboards) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      failures.push(`${relative(ROOT, file)} is not valid JSON (${err.message}) — Grafana would skip it silently at provision time`);
      continue;
    }
    for (const panel of parsed.panels ?? []) {
      for (const t of panel.targets ?? []) if (typeof t.expr === 'string') queries.push(t.expr);
    }
  }

  if (queries.length === 0) {
    failures.push('no committed dashboard has a panel with a query — a dashboard of empty panels is not an SLO');
    return failures;
  }

  // The provider, and the mount that makes its path real. Without the mount
  // Grafana comes up with no dashboards AND NO ERROR, which is the failure this
  // whole arrangement exists to avoid.
  const provider = readIfExists(join(grafana, 'provisioning', 'dashboards', 'dashboards.yaml'));
  if (!provider) {
    failures.push('tooling/infra/grafana/provisioning/dashboards/dashboards.yaml is missing — the dashboards are committed but never loaded');
  } else {
    const providerPath = /path:\s*(\S+)/.exec(provider)?.[1];
    const compose = readIfExists(join(ROOT, 'docker-compose.yml')) ?? '';
    if (!providerPath) {
      failures.push('the Grafana dashboard provider declares no options.path');
    } else if (!compose.includes(`:${providerPath}`)) {
      failures.push(
        `docker-compose.yml mounts nothing at "${providerPath}", where the Grafana provider looks — ` +
          'the provider would find an empty directory and report no error',
      );
    }
  }

  // Something has to be scraped, or every panel renders "No data" forever.
  const prometheus = readIfExists(join(ROOT, 'tooling', 'infra', 'prometheus.yaml')) ?? '';
  if (!/job_name:\s*svc-edge/.test(prometheus)) {
    failures.push('prometheus.yaml scrapes no application target (no svc-edge job) — the SLO panels would have no series to draw');
  }

  // THE CHECK THAT CATCHES REAL ROT: a panel querying a metric nothing emits.
  // A dashboard drifts from the code silently, because "No data" looks exactly
  // like "nothing is wrong right now".
  const emitters = [join(ROOT, 'services', 'svc-edge', 'src', 'metrics.ts')].map((f) => readIfExists(f) ?? '').join('\n');
  const referenced = new Set(queries.flatMap((q) => [...q.matchAll(/\bintafaced_[a-z0-9_]+\b/g)].map((m) => m[0])));

  for (const metric of referenced) {
    // Histogram series are derived names; check the family the code declares.
    const family = metric.replace(/_(bucket|sum|count)$/, '');
    if (!emitters.includes(family)) {
      failures.push(`a dashboard panel queries "${metric}", which no service emits — the panel would read "No data" forever (§14.5)`);
    }
  }

  return failures;
}

function checkPlatformEvidence() {
  return [
    { name: 'e2e happy path + top-3 failure paths, green in CI (§14.3)', failures: checkE2e() },
    { name: 'kill-switch reachable from apps/admin, proved by behaviour (§14.6)', failures: checkKillSwitch() },
    { name: 'SLO dashboard panel provisioned as code (§14.5)', failures: checkSloDashboard() },
  ];
}

// ── Run ─────────────────────────────────────────────────────────────────────

const services = existsSync(SERVICES)
  ? readdirSync(SERVICES)
      .map((s) => join(SERVICES, s))
      .filter((d) => statSync(d).isDirectory())
      .filter((d) => !target || basename(d) === target || basename(d) === `svc-${target}`)
  : [];

if (target && services.length === 0) {
  console.error(`✖ no service matching "${target}" under services/`);
  process.exit(1);
}

console.log('\n══ DEFINITION OF DONE GATE (§14) ══\n');

// Repo-wide gates first.
let repoFailed = false;
for (const script of ['brand-scan.mjs', 'custody-scan.mjs', 'migration-check.mjs']) {
  try {
    const out = execFileSync(process.execPath, [join(ROOT, 'tooling', 'ci', script)], { encoding: 'utf8' });
    process.stdout.write('  ' + out.trim() + '\n');
  } catch (err) {
    repoFailed = true;
    process.stdout.write((err.stdout ?? '') + (err.stderr ?? ''));
  }
}

console.log('');

let serviceFailed = false;
for (const dir of services) {
  const { service, failures } = checkService(dir);
  if (failures.length === 0) {
    console.log(`  ✓ ${service}`);
  } else {
    serviceFailed = true;
    console.log(`  ✖ ${service} — ${failures.length} DoD failure(s)`);
    for (const f of failures) console.log(`      · ${f}`);
  }
}

if (services.length === 0) {
  console.log('  (no services built yet — Phase 0 is foundations; the gate re-arms as each service lands)');
}

// ── Platform-wide DoD evidence ──────────────────────────────────────────────
//
// Only when the whole repo is being gated. `pnpm gate svc-trade` asks about one
// service; failing it on a platform-wide dashboard would make the per-service
// mode useless for the thing people use it for.
let evidenceFailed = false;
if (!target) {
  console.log('\n── Platform DoD evidence (§14.3, §14.5, §14.6) ──');
  for (const { name, failures } of checkPlatformEvidence()) {
    if (failures.length === 0) {
      console.log(`  ✓ ${name}`);
    } else {
      evidenceFailed = true;
      console.log(`  ✖ ${name}`);
      for (const f of failures) console.log(`      · ${f}`);
    }
  }
}

// The remaining manual item. Left as a plain one-line checklist entry, in the
// same shape it has always had, because `feat/app-i18n-keys` is closing it and
// will edit this list — a rewritten block here would collide with that work for
// no benefit. Three lines were removed from this list; nothing was added to it.
console.log('\n── Manual sign-off required (not automatable) ──');
console.log('  □ Every user-facing string i18n-keyed');
console.log('');

if (repoFailed || serviceFailed || evidenceFailed) {
  console.error('✖ DoD GATE FAILED — the module does not ship (Doctrine §0.1: never half done)\n');
  process.exit(1);
}

console.log('✓ DoD gate passed\n');
