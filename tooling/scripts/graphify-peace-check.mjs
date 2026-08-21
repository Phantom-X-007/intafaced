#!/usr/bin/env node
/**
 * Graphify peace check — machine facts only.
 *
 * GREEN = the map loads, is locked to product code, and a smoke query works.
 * GREEN does NOT mean the last builder queried first. That is a separate yes/no.
 *
 * Usage: pnpm graphify:peace
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
const env = { ...process.env, PATH: `/Users/Nitro/.local/bin:${process.env.PATH || ''}` };

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

function runGraphify(args) {
  return spawnSync('graphify', args, { cwd: ROOT, encoding: 'utf8', env, timeout: 120000 });
}

const which = spawnSync('command', ['-v', 'graphify'], { encoding: 'utf8', shell: true, env });
if (which.status !== 0) {
  fail('graphify CLI not on PATH — map cannot be queried this session');
} else {
  const ver = spawnSync('graphify', ['--version'], { encoding: 'utf8', env });
  ok(`graphify CLI ${ver.stdout.trim() || 'present'}`);
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
    if (!built) warn('graph has no built_at_commit — freshness unknown');
    else if (tip) {
      const behind = spawnSync('git', ['rev-list', '--count', `${built}..${tip}`], {
        cwd: ROOT,
        encoding: 'utf8',
      }).stdout.trim();
      const nBehind = Number(behind);
      if (Number.isFinite(nBehind) && nBehind > 50) {
        fail(`graph is ${nBehind} commits behind origin/main — run graphify update .`);
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

if (which.status === 0 && existsSync(GRAPH)) {
  const diag = runGraphify(['diagnose', 'multigraph', '--graph', GRAPH]);
  const dout = `${diag.stdout || ''}\n${diag.stderr || ''}`;
  const missing = /missing_endpoint_edges:\s*(\d+)/.exec(dout);
  const dangling = /dangling_endpoint_edges:\s*(\d+)/.exec(dout);
  const missN = missing ? Number(missing[1]) : -1;
  const dangN = dangling ? Number(dangling[1]) : -1;
  if (diag.status !== 0) fail(`graphify diagnose failed (exit ${diag.status})`);
  else if (missN > 0 || dangN > 0) fail(`diagnose broken edges missing=${missN} dangling=${dangN}`);
  else if (missN === 0 && dangN === 0) ok('diagnose: no missing/dangling endpoints');
  else warn('diagnose ran but counters were not parsed');

  const explained = runGraphify(['explain', 'PayService']);
  const ex = `${explained.stdout || ''}`;
  if (explained.status !== 0) fail('graphify explain PayService failed');
  else if (!ex.includes('payment-service.ts')) fail('explain PayService did not cite payment-service.ts');
  else ok('smoke explain PayService → payment-service.ts');

  const q = runGraphify(['query', 'hosted checkout payment links', '--budget', '800', '--graph', GRAPH]);
  const qo = `${q.stdout || ''}`;
  if (q.status !== 0) fail('graphify query checkout failed');
  else if (!/checkout-page\.ts|payment-service\.ts/.test(qo)) {
    fail('smoke query checkout did not cite checkout-page.ts or payment-service.ts');
  } else ok('smoke query hosted checkout hits pay checkout files');
}

const cites = [
  'services/svc-pay/src/payment-service.ts',
  'services/svc-pay/src/checkout-page.ts',
  'services/svc-identity/src/kyc/document-store.ts',
];
for (const f of cites) {
  const r = spawnSync('git', ['cat-file', '-e', `origin/main:${f}`], { cwd: ROOT });
  if (r.status === 0) ok(`cite exists on origin/main: ${f}`);
  else fail(`cite missing on origin/main: ${f}`);
}

console.log('');
console.log(
  fails.length ? `RESULT  RED — ${fails.length} fail, ${warns.length} warn` : `RESULT  GREEN — ${oks.length} pass, ${warns.length} warn`,
);
console.log('NOTE   GREEN = map works. It does not prove the last builder queried first.');
process.exit(fails.length ? 1 : 0);
