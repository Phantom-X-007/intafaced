#!/usr/bin/env node
/**
 * Vendor Java jar truth (D26-P2-07 · D-S-17 · ADR 2026-08-04).
 *
 * Closes the artifact gap the dual-book residual ADR named:
 *
 *   1. Grade D (ungated reward mints held only by `= null` / early `return`)
 *      must stay gone — proved here by pattern + allowlist band, not by hope.
 *   2. A green `vendor-java-money-scan` is SOURCE evidence only. It must never
 *      be read as "the running jar is safe."
 *   3. The rebuild path must be real and discoverable: compose jar modules →
 *      `tooling/scripts/vendor-java-rebuild.mjs`.
 *
 * What this gate proves (and what it does not):
 *   · Proves Grade D booby-trap shapes are absent from non-test Java.
 *   · Proves the money-scan allowlist carries zero Grade D rows.
 *   · Proves the rebuild script exists, parses the same compose jar set, and
 *     is wired in package.json.
 *   · Proves any PRESENT compose jar is not older than its module's scanned
 *     sources (stale jar = lying posture).
 *   · Does NOT claim a JVM boot, does NOT claim wallet_rpc safety, does NOT
 *     treat an absent jar as "safe" — absence is the honest unverified state.
 *
 * Exit 0 = Grade D empty + jar truth posture honest + rebuild path real.
 * Exit 1 = regression or lying claim surface.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const VENDOR = join(ROOT, 'vendor');
const COMPOSE = join(ROOT, 'vendor', 'upstream-exchange-compose.yml');
const FRAMEWORK = join(ROOT, 'vendor', 'upstream-exchange', '00_framework');
const MONEY_SCAN = join(ROOT, 'tooling', 'ci', 'vendor-java-money-scan.mjs');
const REBUILD = join(ROOT, 'tooling', 'scripts', 'vendor-java-rebuild.mjs');
const PACKAGE_JSON = join(ROOT, 'package.json');

if (!statSync(VENDOR, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('✖ vendor-java-jar-truth: vendor/ tree missing — cannot prove Grade D empty or jar posture');
  process.exit(1);
}

/** @type {string[]} */
const failures = [];
/** @type {string[]} */
const notes = [];

function walkJava(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'target' || name === '.git') continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkJava(p, out);
    else if (name.endsWith('.java')) out.push(p);
  }
  return out;
}

function newestMtime(files) {
  let max = 0;
  for (const f of files) {
    try {
      const t = statSync(f).mtimeMs;
      if (t > max) max = t;
    } catch {
      /* ignore */
    }
  }
  return max;
}

// ── 1. Grade D booby traps must stay gone ──────────────────────────────────
// These were the only "controls" on the eight deleted reward mints. Reappearing
// means someone restored a one-line re-arm instead of a ledger recipe.
const GRADE_D_PATTERNS = [
  {
    id: 'reward-activity-null-short-circuit',
    re: /RewardActivitySetting\s+\w+\s*=\s*null/,
    why: 'Grade D booby trap — ungated mint held only by `= null`',
  },
  {
    id: 'reward-promotion-null-short-circuit',
    re: /RewardPromotionSetting\s+\w+\s*=\s*null/,
    why: 'Grade D booby trap — ungated mint held only by `= null`',
  },
];

const javaFiles = walkJava(VENDOR).filter((p) => !/[\\/]src[\\/]test[\\/]/.test(p.replace(/\\/g, '/')));
let gradeDHits = 0;
for (const file of javaFiles) {
  const src = readFileSync(file, 'utf8');
  // Strip // and /* */ comments so quoted history in comments does not fail.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');
  for (const rule of GRADE_D_PATTERNS) {
    if (rule.re.test(code)) {
      gradeDHits++;
      failures.push(`${relative(ROOT, file).replace(/\\/g, '/')}  [${rule.id}] ${rule.why}`);
    }
  }
}
if (gradeDHits === 0) {
  notes.push(`Grade D pattern band empty (${GRADE_D_PATTERNS.length} trap shape(s) over ${javaFiles.length} Java file(s))`);
}

// ── 2. Money-scan allowlist must keep Grade D heading empty ────────────────
if (!existsSync(MONEY_SCAN)) {
  failures.push('tooling/ci/vendor-java-money-scan.mjs missing — Grade D ratchet unreadable');
} else {
  const moneySrc = readFileSync(MONEY_SCAN, 'utf8');
  if (!/Grade D:\s*EMPTY/i.test(moneySrc)) {
    failures.push('vendor-java-money-scan.mjs lost the "Grade D: EMPTY" allowlist band heading');
  }
  // Any allowlist reason that still says Grade D is a new ungated mint row.
  const gradeDRows = [...moneySrc.matchAll(/reason:\s*['`]([^'`]*Grade D[^'`]*)['`]/gi)];
  if (gradeDRows.length > 0) {
    for (const m of gradeDRows) failures.push(`money-scan allowlist still carries Grade D row: ${m[1].slice(0, 120)}`);
  }
  // Forbidden overclaim — source scan must not market itself as runtime closure.
  const forbiddenClaims = [
    /Java book is closed/i,
    /runtime safe because (?:the )?scan/i,
    /jars? (?:are|is) safe/i,
    /dual-book (?:is )?closed at runtime/i,
  ];
  for (const re of forbiddenClaims) {
    if (re.test(moneySrc)) {
      failures.push(`vendor-java-money-scan.mjs overclaims runtime safety (${re}) — source scan alone is not evidence`);
    }
  }
  if (!/SOURCE ONLY|not jar\/runtime|source scan alone/i.test(moneySrc)) {
    failures.push(
      'vendor-java-money-scan.mjs must state SOURCE ONLY / not jar-runtime proof (ADR: no safety claim from source scan alone)',
    );
  }
}

// ── 3. Rebuild path must be real ───────────────────────────────────────────
if (!existsSync(REBUILD)) {
  failures.push('tooling/scripts/vendor-java-rebuild.mjs missing — rebuild path is not real');
} else if (!existsSync(COMPOSE)) {
  failures.push('vendor/upstream-exchange-compose.yml missing — cannot inventory compose jars');
} else {
  const { composeJarModules } = await import(pathToFileURL(REBUILD).href);
  const composeText = readFileSync(COMPOSE, 'utf8');
  const modules = composeJarModules(composeText);
  if (modules.length < 4) {
    failures.push(`compose jar module inventory too small (${modules.length}) — expected cloud/exchange/market/ucenter-api/…`);
  } else {
    notes.push(`rebuild path inventories ${modules.length} compose module(s): ${modules.join(', ')}`);
  }

  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
  const scripts = pkg.scripts ?? {};
  const rebuildWired =
    typeof scripts['vendor-java:rebuild'] === 'string' && scripts['vendor-java:rebuild'].includes('vendor-java-rebuild.mjs');
  if (!rebuildWired) {
    failures.push('package.json missing scripts["vendor-java:rebuild"] → tooling/scripts/vendor-java-rebuild.mjs');
  }

  // Stale-jar check: a present jar older than its module sources is the exact
  // lying posture the ADR forbids (neutering in source, pre-neutering in jar).
  let present = 0;
  let absent = 0;
  let stale = 0;
  for (const mod of modules) {
    const jar = join(FRAMEWORK, mod, 'target', `${mod}.jar`);
    const srcRoot = join(FRAMEWORK, mod, 'src');
    if (!existsSync(jar)) {
      absent++;
      continue;
    }
    present++;
    const sources = walkJava(srcRoot);
    const srcNewest = newestMtime(sources);
    const jarMtime = statSync(jar).mtimeMs;
    if (sources.length > 0 && jarMtime + 1000 < srcNewest) {
      stale++;
      failures.push(
        `${mod}/target/${mod}.jar is STALE vs scanned sources ` +
          `(jar mtime ${new Date(jarMtime).toISOString()}, source tip ${new Date(srcNewest).toISOString()}) — ` +
          'run `pnpm vendor-java:rebuild`; do not cite source scan as runtime safety',
      );
    }
  }
  notes.push(
    `compose jars: ${present} present, ${absent} absent` +
      (stale ? `, ${stale} STALE` : '') +
      (absent === modules.length
        ? ' — runtime UNVERIFIED (honest; rebuild path is pnpm vendor-java:rebuild)'
        : present > 0 && stale === 0
          ? ' — present jars not older than module sources'
          : ''),
  );
}

// ── 4. vendor-compile workflow must keep the rebuild path reachable in CI ──
const compileWf = join(ROOT, '.github', 'workflows', 'vendor-compile.yml');
if (!existsSync(compileWf)) {
  failures.push('.github/workflows/vendor-compile.yml missing — CI rebuild path absent');
} else {
  const wf = readFileSync(compileWf, 'utf8');
  if (!/-DskipTests\s+package/.test(wf)) {
    failures.push('vendor-compile.yml must invoke `mvn … -DskipTests package` so jars can be built from scanned source in CI');
  }
  if (!/source scan alone is not runtime safety/i.test(wf)) {
    failures.push('vendor-compile.yml must state that source scan alone is not runtime safety');
  }
  // CI -pl list must cover every compose jar module the rebuild script inventories.
  if (existsSync(REBUILD) && existsSync(COMPOSE)) {
    const { composeJarModules } = await import(pathToFileURL(REBUILD).href);
    const modules = composeJarModules(readFileSync(COMPOSE, 'utf8'));
    const pl = wf.match(/-pl\s+([a-z0-9_,-]+)\s+-am\s+-DskipTests\s+package/i);
    if (!pl) {
      failures.push('vendor-compile.yml package job missing `-pl <modules> -am -DskipTests package`');
    } else {
      const listed = new Set(pl[1].split(','));
      for (const mod of modules) {
        if (!listed.has(mod)) {
          failures.push(`vendor-compile.yml package -pl missing compose module "${mod}" (sync with vendor-java-rebuild)`);
        }
      }
    }
  }
}

if (failures.length) {
  console.error('✖ vendor-java-jar-truth failed — Grade D / jar posture dishonest:\n');
  for (const f of failures) console.error(`  · ${f}`);
  console.error('\n  Rule (ADR 2026-08-04): no claim about Java runtime safety may cite a source scan as its evidence.');
  console.error('  Rebuild: pnpm vendor-java:rebuild   Proof siblings: pnpm scan:vendor-java-money\n');
  process.exit(1);
}

console.log(
  `✓ vendor-java-jar-truth — Grade D gone; source scan ≠ runtime safety; rebuild path real` +
    (notes.length ? ` · ${notes.join(' · ')}` : ''),
);
