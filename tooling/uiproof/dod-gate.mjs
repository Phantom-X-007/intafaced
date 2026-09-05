#!/usr/bin/env node
/**
 * remaining-SOT §18.2 return gate (GO §6.10).
 *
 * Classifies every DoD bullet. Does not declare the frontend done.
 * Exit 0 = every bullet has a class + evidence object on disk.
 * Exit 1 = missing classification or missing evidence file.
 * Prints FRONTEND_NOT_DONE unless every required bullet is closed
 * (BROWSER-PROVED / SOURCE-READ / REFUSED / SOCKET / LATER / TASTE).
 *
 *   node tooling/uiproof/dod-gate.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const SHA = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const CLASSES = new Set(['BROWSER-PROVED', 'SOURCE-READ', 'REFUSED', 'SOCKET', 'LATER', 'TASTE', 'OPEN']);

function file(rel) {
  return join(REPO, rel);
}

function mustExist(rel) {
  const p = file(rel);
  return existsSync(p) ? rel : null;
}

/** @typedef {{ id: string, bullet: string, cls: string, evidence: string, note: string, blocksDone?: boolean }} Row */

/** @type {Row[]} */
const ROWS = [
  {
    id: '18.2-p0',
    bullet: 'All FE-P0 items closed with browser/API/property evidence',
    cls: 'SOURCE-READ',
    evidence: [
      'apps/admin/src/lib/admin-bff-gate.ts',
      'apps/admin/e2e/bff-unconfigured.spec.mjs',
      'vendor/upstream-exchange/05_Web_Front/src/assets/js/ix-money.golden.js',
      'tooling/uiproof/drawer.spec.mjs',
      'vendor/upstream-exchange/05_Web_Front/src/assets/js/session-authority.golden.js',
    ].join(', '),
    note: 'P0-01 BFF deny-blank; P0-02 ix-money+kline goldens; P0-03 drawer.spec; P0-04 session-authority. Drawer BROWSER-PROVED only on a named SHA run, not this SHA by default.',
  },
  {
    id: '18.2-routes',
    bullet: 'Every navigable route in executable coverage or explicit exclusion',
    cls: 'BROWSER-PROVED',
    evidence: 'tooling/uiproof/route-authority.mjs, tooling/uiproof/matrix.mjs, tooling/uiproof/crops/look-tier-a-f1/SHA256SUMS',
    note: '89 routes × 1440+390 = 178 F1 cells. Not all four fixtures. Not WCAG.',
  },
  {
    id: '18.2-tiers',
    bullet: 'All Tier A routes and Tier B families pass; Tier C workflows; Tier D named human certification',
    cls: 'OPEN',
    evidence:
      'tooling/uiproof/crops/look-tier-a-f1/SHA256SUMS, tooling/uiproof/reflow-320.spec.mjs, tooling/uiproof/reflow-tablet.spec.mjs, tooling/uiproof/recovery.spec.mjs',
    note: 'Tier A F1 hashed. 768/1024 BROWSER-PROVED #3949. /platform 320 closed #3986. Tier C recovery.spec exists. Tier D named AT OPEN.',
    blocksDone: true,
  },
  {
    id: '18.2-money',
    bullet: 'No canonical money value is a JS number; no frontend owns balance or authorization truth',
    cls: 'SOURCE-READ',
    evidence:
      'vendor/upstream-exchange/05_Web_Front/src/assets/js/ix-money.golden.js, vendor/upstream-exchange/05_Web_Front/src/assets/js/kline-ohlcv.golden.js',
    note: 'ratio() last step is CSS float (#3810). Ledger stays packages/ledger-client.',
  },
  {
    id: '18.2-session',
    bullet: 'Member and admin sessions/permissions fail closed; no persistent browser bearer',
    cls: 'SOURCE-READ',
    evidence:
      'vendor/upstream-exchange/05_Web_Front/src/assets/js/session-authority.golden.js, apps/admin/src/lib/admin-bff-gate.ts, vendor/upstream-exchange/05_Web_Front/src/assets/js/ix-dup-tab-lock.golden.js',
    note: 'TOKEN/MEMBER erased on boot. Admin blank-env 503. Dup-tab lock has no bearer.',
  },
  {
    id: '18.2-desk',
    bullet: 'Pair switching, chart freshness, reprice/amend/cancel, saved layout, keyboard, touch, accessible alternatives',
    cls: 'OPEN',
    evidence:
      'tooling/uiproof/drawer.spec.mjs, vendor/upstream-exchange/05_Web_Front/src/assets/js/chart-stomp-refuse.golden.js, tooling/uiproof/layout-reset-roundtrip.spec.mjs, vendor/upstream-exchange/05_Web_Front/src/assets/js/shell-skip-404.golden.js, tooling/uiproof/recovery.spec.mjs',
    note: 'STOMP refused #3878. Reset+⌘K #3874. Iceberg/peg/collar buttons mounted #3830. Touch/AT OPEN.',
    blocksDone: true,
  },
  {
    id: '18.2-admin',
    bullet: 'Admin queues real or explicitly unavailable; consequential actions bind facts, lock, reconcile, receipts',
    cls: 'SOURCE-READ',
    evidence: 'apps/admin/src/components/operator-queues.tsx, apps/admin/src/app/error.tsx, apps/admin/src/app/not-found.tsx',
    note: 'Withdrawal NOT MOUNTED. Queue look is Codex. Error/not-found/loading exist.',
  },
  {
    id: '18.2-states',
    bullet: 'Loading/empty/live/stale/refused/error/unknown distinct on member and admin',
    cls: 'SOURCE-READ',
    evidence:
      'vendor/upstream-exchange/05_Web_Front/src/assets/js/account-bind-unknown.golden.js, apps/admin/src/app/error.tsx, vendor/upstream-exchange/05_Web_Front/src/components/uc/IxHonestState.vue',
    note: 'Four calibration fixtures. Reachable-zero still needs a named live fixture. Unknown ≠ failed on bind (#3883).',
  },
  {
    id: '18.2-rum',
    bullet: 'Supported runtime/browser policy, performance budgets, production observability exist and pass stated gates',
    cls: 'SOURCE-READ',
    evidence: 'tooling/uiproof/browser-support.mjs, tooling/uiproof/rum-policy.mjs, tooling/uiproof/rum-policy.golden.js',
    note: 'Field RUM refused until a named collector. Lab CWV is guidance, not a pass. Node LTS member leftover is LATER toolchain.',
  },
  {
    id: '18.2-visual',
    bullet: 'Visual proof durable and tied to an exact commit; scorecard and Graphify updated',
    cls: 'BROWSER-PROVED',
    evidence: 'tooling/uiproof/crops/look-tier-a-f1/SHA256SUMS',
    note: '178 F1 crops hashed. Crops bind the render SHA in SUMS, not necessarily this HEAD. Graphify skips vendor Vue. Taste TASTE-open.',
  },
  {
    id: '18.2-docs',
    bullet: 'Canonical documents do not contradict shipped architecture or claim unfinished waves as current',
    cls: 'SOURCE-READ',
    evidence: 'docs/FRONTEND-REMAINING-SOT-2026-08-25.md, docs/PROMPT-GROK-FRONTEND-GO.md',
    note: '§9.2/§19.7 re-derived vs merged PRs (178 crops, Reset+⌘K, RUM policy, R11, 768/1024). Remaining OPEN named in §19.7, not claimed as unfinished waves.',
  },
  {
    id: '18.2-m07',
    bullet: 'Every M07 R-item NOW-complete, REFUSE-closed, SOCKET, or LATER with a named owner',
    cls: 'OPEN',
    evidence: 'docs/FRONTEND-REMAINING-SOT-2026-08-25.md §19.4 + goldens/specs listed in M07 rows below',
    note: 'R03 densify LOOK. R04 mounts exist #3830. R08 AT OPEN. /platform 320 closed #3986. R02/R07 SOCKET.',
    blocksDone: true,
  },
  {
    id: 'm07-r01',
    bullet: 'R01 local layout Reset + ⌘K orphans',
    cls: 'BROWSER-PROVED',
    evidence: 'tooling/uiproof/layout-reset-roundtrip.spec.mjs',
    note: '2 passed on prior SHA. Org share SOCKET.',
  },
  {
    id: 'm07-r02',
    bullet: 'R02 drawings / AC / compare / replay',
    cls: 'SOCKET',
    evidence: 'docs/LICENCE-POSITION.md',
    note: 'Advanced Charts access. Alerts/Bar Replay REFUSE even after AC. LWC interim.',
  },
  {
    id: 'm07-r03',
    bullet: 'R03 densify book/tape/watchlist; heatmap REFUSE',
    cls: 'OPEN',
    evidence: 'vendor/upstream-exchange/05_Web_Front/src/pages/exchange/Exchange.vue',
    note: 'Book+tape exist. Densify is Codex LOOK. Heatmap REFUSE until L3.',
    blocksDone: true,
  },
  {
    id: 'm07-r04',
    bullet: 'R04 capability matrix + refuse-or-real ticket mounts',
    cls: 'SOURCE-READ',
    evidence: 'vendor/upstream-exchange/05_Web_Front/src/assets/js/spot-order-preview.golden.js',
    note: 'Capability tests exist. Iceberg/peg/collar buttons mounted #3830. Densify is R03 LOOK, not a missing door.',
  },
  {
    id: 'm07-r05',
    bullet: 'R05 unified blotter; refuse missing books',
    cls: 'SOURCE-READ',
    evidence: 'vendor/upstream-exchange/05_Web_Front/src/pages/exchange/Exchange.vue',
    note: '#3836 refuse tabs.',
  },
  {
    id: 'm07-r06',
    bullet: 'R06 risk strip if wire returns IM/MM/liq',
    cls: 'SOURCE-READ',
    evidence: 'vendor/upstream-exchange/05_Web_Front/src/assets/js/exchange-r06-r13-r14.golden.js',
    note: '#3822 isolated IM + expiry. No invented Greeks. EMS tree unwired (admin tRPC).',
  },
  {
    id: 'm07-r07',
    bullet: 'R07 mobile control plane',
    cls: 'SOCKET',
    evidence: 'docs/FRONTEND-REMAINING-SOT-2026-08-25.md',
    note: 'PX-S05-O08. 390 desk is not a control plane.',
  },
  {
    id: 'm07-r08',
    bullet: 'R08 a11y / locale / precision / degraded / no-stale',
    cls: 'OPEN',
    evidence:
      'tooling/uiproof/reflow-320.spec.mjs, tooling/uiproof/reflow-tablet.spec.mjs, vendor/upstream-exchange/05_Web_Front/src/assets/js/desk-reduced-motion.golden.js, vendor/upstream-exchange/05_Web_Front/src/assets/js/shell-skip-404.golden.js',
    note: '768/1024 BROWSER-PROVED #3949. /platform 320 closed #3986. Named AT OPEN. 44px submit LOOK #7613122bf.',
    blocksDone: true,
  },
  {
    id: 'm07-r09',
    bullet: 'R09 per-channel session status',
    cls: 'SOURCE-READ',
    evidence: 'vendor/upstream-exchange/05_Web_Front/src/pages/exchange/Exchange.vue',
    note: '#3813 / #3837 chips. Not one green connected.',
  },
  {
    id: 'm07-r10',
    bullet: 'R10 lock-all / order-entry lock / live banner / hotkeys',
    cls: 'SOURCE-READ',
    evidence: 'vendor/upstream-exchange/05_Web_Front/src/assets/js/ix-dup-tab-lock.js',
    note: 'Lock+banner+hotkey no-op. Policy magnitudes SOCKET.',
  },
  {
    id: 'm07-r11',
    bullet: 'R11 crash/refresh/dup-tab: server truth before new intent',
    cls: 'SOURCE-READ',
    evidence: 'vendor/upstream-exchange/05_Web_Front/src/assets/js/ix-dup-tab-lock.golden.js, tooling/uiproof/recovery.spec.mjs',
    note: '#3870 dup-tab. recovery.spec exists; re-run on this SHA still owed for BROWSER-PROVED.',
  },
  {
    id: 'm07-r12',
    bullet: 'R12 long-session budgets',
    cls: 'LATER',
    evidence: 'docs/FRONTEND-REMAINING-SOT-2026-08-25.md',
    note: 'Wave 3. Do not fake.',
  },
  {
    id: 'm07-r13',
    bullet: 'R13 EMS parent/child read-only if wire returns them',
    cls: 'REFUSED',
    evidence: 'vendor/upstream-exchange/05_Web_Front/src/assets/js/exchange-r06-r13-r14.golden.js',
    note: 'listLiveEmsChildren is admin tRPC, not desk REST. Care trees REFUSE.',
  },
  {
    id: 'm07-r14',
    bullet: 'R14 instrument-borne funding/expiry only',
    cls: 'SOURCE-READ',
    evidence: 'vendor/upstream-exchange/05_Web_Front/src/assets/js/exchange-r06-r13-r14.golden.js',
    note: 'Quiet expiry on pair header. Price alerts REFUSE.',
  },
  {
    id: 'm07-r15',
    bullet: 'R15 local versioned presets + Reset; org share SOCKET',
    cls: 'SOURCE-READ',
    evidence: 'vendor/upstream-exchange/05_Web_Front/src/assets/js/desk-prefs.golden.js, tooling/uiproof/layout-reset-roundtrip.spec.mjs',
    note: 'Share SOCKET.',
  },
  {
    id: 'm07-r16',
    bullet: 'R16 journal / live vs replay',
    cls: 'LATER',
    evidence: 'docs/FRONTEND-REMAINING-SOT-2026-08-25.md',
    note: 'Replay REFUSE. Retention SOCKET.',
  },
  {
    id: 'm07-r17',
    bullet: 'R17 cancel/cancel-all/staged reprice/close; flatten REFUSE',
    cls: 'SOURCE-READ',
    evidence: 'tooling/uiproof/recovery.spec.mjs',
    note: 'closePosition DELETE. Flatten/join/reverse REFUSE until blast-radius payload.',
  },
  {
    id: 'taste',
    bullet: 'v1 freeze / taste pass on delivered 1440+390 crops',
    cls: 'TASTE',
    evidence: 'tooling/uiproof/crops/look-tier-a-f1/SHA256SUMS, tooling/uiproof/crops/calib-five-routes-v0/SHA256SUMS',
    note: 'Owner eye. Not a Grok close.',
    blocksDone: true,
  },
];

function evidenceFiles(row) {
  return row.evidence
    .split(',')
    .map((s) => s.trim().split(' ')[0])
    .filter((s) => s.includes('/') && !s.startsWith('docs/') && !s.startsWith('§'));
}

let missing = 0;
let openDone = 0;
const sha178 = file('tooling/uiproof/crops/look-tier-a-f1/SHA256SUMS');
let cellCount = 0;
if (existsSync(sha178)) {
  cellCount = readFileSync(sha178, 'utf8')
    .split('\n')
    .filter((l) => /^[0-9a-f]{64}  /.test(l)).length;
}

console.log(`uiproof dod-gate SHA ${SHA.slice(0, 12)}`);
console.log(`Tier-A F1 hashed cells: ${cellCount} (want 178)`);
if (cellCount !== 178) {
  console.error('FAIL: Tier-A SHA256SUMS is not 178 rows');
  missing += 1;
}

for (const row of ROWS) {
  if (!CLASSES.has(row.cls)) {
    console.error(`FAIL ${row.id}: bad class ${row.cls}`);
    missing += 1;
    continue;
  }
  const files = evidenceFiles(row);
  const absent = files.filter((rel) => !mustExist(rel));
  if (absent.length) {
    console.error(`FAIL ${row.id}: missing ${absent.join(', ')}`);
    missing += 1;
  }
  const flag = row.blocksDone && (row.cls === 'OPEN' || row.cls === 'TASTE') ? ' BLOCKS-DONE' : '';
  if (
    row.blocksDone &&
    row.cls !== 'SOCKET' &&
    row.cls !== 'LATER' &&
    row.cls !== 'REFUSED' &&
    row.cls !== 'BROWSER-PROVED' &&
    row.cls !== 'SOURCE-READ'
  ) {
    openDone += 1;
  }
  console.log(`${row.cls.padEnd(16)} ${row.id.padEnd(14)} ${row.bullet}${flag}`);
  console.log(`                 evidence: ${row.evidence}`);
  console.log(`                 ${row.note}`);
}

if (missing) {
  console.error(`\ndod-gate: ${missing} missing evidence/class`);
  process.exit(1);
}

console.log('\nFRONTEND_NOT_DONE — remaining-SOT §18.2 is not all-true.');
console.log(`blocking unclassified/open/taste rows: ${openDone}`);
console.log('Correct status: frontend baseline shipped; closure in progress.');
process.exit(0);
