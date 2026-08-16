#!/usr/bin/env node
/**
 * Graphify peace check — machine facts only.
 * Exit 0 = map is usable. Exit 1 = do not trust the graph this session.
 * WARN lines are holes, not a red map.
 *
 * Usage: node tooling/scripts/graphify-peace-check.mjs
 *        pnpm graphify:peace
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT =
  spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).stdout.trim() || process.cwd();
const GRAPH = resolve(ROOT, 'graphify-out/graph.json');
const AGENTS = resolve(ROOT, 'AGENTS.md');
const IGNORE = resolve(ROOT, '.graphifyignore');

const fails = [];
const warns = [];
const oks = [];

function ok(msg) {
  oks.push(msg);
  console.log(`PASS  ${msg}`);
}
function warn(msg) {
  warns.push(msg);
  console.log(`WARN  ${msg}`);
}
function fail(msg) {
  fails.push(msg);
  console.log(`FAIL  ${msg}`);
}

if (!existsSync(GRAPH)) {
  fail('graphify-out/graph.json missing — run pnpm graphify:extract once in this worktree');
} else {
  let data;
  try {
    data = JSON.parse(readFileSync(GRAPH, 'utf8'));
  } catch (e) {
    fail(`graph.json is not valid JSON (${e.message})`);
    data = null;
  }
  if (data) {
    const n = (data.nodes || []).length;
    const e = (data.links || data.edges || []).length;
    if (n < 100) fail(`graph too small (${n} nodes)`);
    else ok(`graph loads (${n} nodes, ${e} edges)`);

    let paste = 0;
    let docs = 0;
    let md = 0;
    let vendor = 0;
    for (const node of data.nodes || []) {
      const sf = node.source_file || node.source || '';
      if (sf.includes('paste-w') || sf.includes('docs/paste')) paste += 1;
      if (sf.startsWith('docs/')) docs += 1;
      if (sf.endsWith('.md')) md += 1;
      if (sf.includes('vendor/')) vendor += 1;
    }
    if (paste || docs || md || vendor) {
      fail(`corpus lock broken (paste=${paste} docs=${docs} md=${md} vendor=${vendor})`);
    } else {
      ok('corpus lock holds (no paste walls, no docs/, no markdown, no vendor/)');
    }

    const built = data.built_at_commit;
    const tip = spawnSync('git', ['rev-parse', 'origin/main'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).stdout.trim();
    if (built && tip) {
      const behind = spawnSync('git', ['rev-list', '--count', `${built}..${tip}`], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
      const nBehind = Number(behind);
      if (Number.isFinite(nBehind) && nBehind > 50) {
        warn(`graph is ${nBehind} commits behind origin/main — run graphify update .`);
      } else {
        ok(`graph commit ${String(built).slice(0, 8)} vs tip (${nBehind || 0} behind)`);
      }
    }
  }
}

if (!existsSync(IGNORE)) fail('.graphifyignore missing');
else ok('.graphifyignore present');

if (!existsSync(AGENTS)) fail('AGENTS.md missing');
else {
  const text = readFileSync(AGENTS, 'utf8');
  if (!text.includes('graphify query')) fail('AGENTS.md lost the query-first rule');
  else ok('AGENTS.md still says query first');
}

const which = spawnSync('command', ['-v', 'graphify'], { encoding: 'utf8', shell: true });
if (which.status !== 0) warn('graphify CLI not on PATH in this shell');
else {
  const ver = spawnSync('graphify', ['--version'], { encoding: 'utf8' });
  ok(`graphify CLI ${ver.stdout.trim() || 'present'}`);
}

const pay = spawnSync('git', ['cat-file', '-e', 'origin/main:services/svc-pay/src/payment-service.ts'], {
  cwd: ROOT,
});
if (pay.status === 0) ok('sample cite payment-service.ts exists on origin/main');
else warn('could not confirm payment-service.ts on origin/main');

console.log('');
console.log(
  fails.length ? `RESULT  RED — ${fails.length} fail, ${warns.length} warn` : `RESULT  GREEN — ${oks.length} pass, ${warns.length} warn`,
);
process.exit(fails.length ? 1 : 0);
