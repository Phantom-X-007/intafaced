#!/usr/bin/env node
/**
 * SHA256SUMS for committed crop PNGs that shipped without them.
 * Hashes bytes already in git — does not recapture.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const WT = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
  encoding: 'utf8',
}).trim();

const PACKS = [
  {
    dir: 'bank-layer-a',
    commit: 'f91303fcbdfd79e6cb816838a7c1565c979aac6a',
    route: '/bank',
    fixture: 'F1 anonymous + dependencies down (from filename)',
  },
  {
    dir: 'pay-layer-a',
    commit: 'c4e0a500c694137e4385cfd0e5eb20adfb2172ce',
    route: '/pay and /pay/checkout',
    fixture: 'F1 anonymous + dependencies down (from filename)',
  },
  {
    dir: 'look-money-states-v0',
    commit: 'aa42aab1d13ff6a008a2ed8734c025f7f46d3902',
    route: '/login, /exchange/btc_usdt, /uc/money',
    fixture: 'F1 signed-out and F2 memory-authenticated degraded (from filename)',
  },
  {
    dir: 'look-admin-queues-v0',
    commit: '1593cb92b17ffbcc0344a9df5a000b99ad009c27',
    route: '/admin tools (member shell refuse)',
    fixture: 'F4 explicitly refused not-built (from filename)',
  },
  {
    dir: 'calib-five-routes-v0',
    commit: 'c69a6399a436745c1da2ca09316f105ea428c905',
    route: '/, /login, /bank, /exchange/btc_usdt, /uc/money',
    fixture: 'F1 anonymous and F2 memory-authenticated degraded (from filename)',
  },
];

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const cropsRoot = join(REPO_ROOT, 'tooling/uiproof/crops');
for (const pack of PACKS) {
  const dir = join(cropsRoot, pack.dir);
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.png'))
    .sort();
  if (files.length === 0) throw new Error(`no PNGs in ${pack.dir}`);
  const sums = files.map((name) => `${sha256File(join(dir, name))}  ${name}`);
  const meta = [
    ...sums,
    '',
    'Hashed from committed PNG bytes — not recaptured.',
    `Pack commit: ${pack.commit}`,
    `Route: ${pack.route}`,
    `Fixture: ${pack.fixture}`,
    'Browser: Chromium (Playwright) — original capture lane',
    'Viewports: 1440x900, 390x844 (from filenames)',
    `Worktree: ${WT}`,
    'Claim: BROWSER-PROVED / CLASS LOOK',
    'Task: remaining-SOT §15.2 durable evidence — add SHA256SUMS to packs that shipped PNGs without them.',
    'API/session behavior: not re-derived; see original filenames.',
  ].join('\n');
  writeFileSync(join(dir, 'SHA256SUMS'), meta + '\n');
  console.log(`wrote ${pack.dir}/SHA256SUMS (${files.length} pngs)`);
}
