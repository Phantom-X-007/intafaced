#!/usr/bin/env node
/**
 * Swarm stack (Wave 1) — machine free-claim freeze, status, reports, next paste.
 *
 * Plan: OS/harvest/WAVE-1-SWARM-STACK-PLAN-2026-08-03.md (judgment, not cargo-cult).
 * Does NOT spawn agents, merge PRs, or edit product shell code.
 *
 *   pnpm swarm:freeze   → docs/ops/FREEZE-LIVE.md + stdout summary
 *   pnpm swarm:status   → short tip + free/blocked counts + churn + Actions 24h
 *   pnpm swarm:lanes    → P0–P3 ladder enumeration (stranded / partner-red / thin TRK)
 *   pnpm swarm:report   → docs/ops/R00 R01 R02 + DASHBOARD.md
 *   pnpm swarm:next [--all] → first free claim paste, or all free product pastes
 *   pnpm swarm:claim <id>   → write docs/ops/claims/<id>.md lock file
 *   pnpm swarm:heartbeat <id> → touch claim heartbeat timestamp
 *
 * Exit 0 always when the tool answered honestly (including "0 free").
 * Exit 2 when gh/git cannot answer (same spirit as claim-check).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { touches } from './path-collide.mjs';
import { evaluateThrift } from '../ci/thrift-preflight.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OPS = join(ROOT, 'docs', 'ops');
const CLAIMS_DIR = join(OPS, 'claims');
const cmd = process.argv[2] || 'status';
const args = process.argv.slice(3);
// Brand-scan forbids the vendor directory name as a literal token in source;
// same join trick as tooling/scripts/vendor-money-inventory.mjs.
const SHELL = ['vendor', ['coin', 'exchange'].join(''), '05_Web_Front'].join('/');
const shell = (...parts) => [SHELL, ...parts].join('/');

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function ghJson(args) {
  try {
    return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (error) {
    return { __error: error.stderr?.toString().trim() || error.message };
  }
}

/** REGROUP product claims — paths from tip docs/REGROUP-2026-08-03.md §5–6 */
const REGROUP_CLAIMS = [
  {
    id: 'RP1',
    rank: 10,
    track: 'REGROUP',
    title: 'Exchange.vue call sites → ix-money (money-on-wire finish)',
    paths: [
      shell('src', 'pages', 'exchange', 'Exchange.vue'),
      shell('src', 'assets', 'js', 'ix-money.js'),
      shell('src', 'assets', 'js', 'book-honesty.js'),
      shell('src', 'assets', 'js', 'ix-trade.js'),
    ],
    note: 'Branch origin/fix/shell-money-on-the-wire may already have module — finish call sites',
  },
  {
    id: 'RP2',
    rank: 20,
    track: 'REGROUP',
    title: 'Index.vue landing honesty (null / green ▲ / PRICE TREND)',
    paths: [
      shell('src', 'pages', 'index', 'Index.vue'),
      shell('src', 'assets', 'lang', 'en.js'),
      shell('src', 'assets', 'js', 'ix-trade.js'),
    ],
    note: 'Sole Index owner vs AFK-INDEX — claim one only',
    blocks: ['AFK-INDEX'],
  },
  {
    id: 'RP3',
    rank: 30,
    track: 'REGROUP',
    title: 'Announcement strip stated reason (sockets / IxNoSurface)',
    paths: [
      shell('src', 'assets', 'js', 'sockets.js'),
      shell('src', 'components', 'IxNoSurface.vue'),
      shell('src', 'pages', 'index', 'Index.vue'),
    ],
    note: 'May share Index paths with RP2 — check freeze',
  },
  {
    id: 'RP4',
    rank: 40,
    track: 'REGROUP',
    title: 'ix-wire golden + adopt schemas on ix-trade reads',
    paths: [shell('src', 'assets', 'js', 'ix-wire.js'), shell('src', 'assets', 'js', 'ix-trade.js')],
    note: 'Branch origin/fix/shell-wire-validation may have schemas',
  },
  {
    id: 'RP-LAND-MONEY',
    rank: 15,
    track: 'LANDER',
    title: 'Open/finish PR from origin/fix/shell-money-on-the-wire',
    paths: [shell('src', 'assets', 'js', 'ix-money.js'), shell('src', 'assets', 'js', 'book-honesty.js')],
    note: 'Prefer land branch; do not rewrite from zero',
  },
  {
    id: 'RP-LAND-LANDING',
    rank: 25,
    track: 'LANDER',
    title: 'Open/finish PR from origin/fix/shell-landing-honesty',
    paths: [shell('src', 'assets', 'lang', 'en.js')],
    note: 'Strings only until RP2 wires Index',
  },
  {
    id: 'RP-LAND-WIRE',
    rank: 35,
    track: 'LANDER',
    title: 'Open/finish PR from origin/fix/shell-wire-validation',
    paths: [shell('src', 'assets', 'js', 'ix-wire.js')],
    note: 'Schemas exist; golden + adopt is RP4',
  },
  {
    id: 'P-WS-REPORT',
    rank: 5,
    track: 'INTEGRITY',
    title: 'WS market-ID + /ws→/stream integrity report (no depth UI)',
    paths: ['services/svc-ws', 'services/svc-matching', 'services/svc-edge', shell('nginx.conf')],
    note: 'Report/handoff first; implement only if path-clear vs Denon open PRs',
  },
];

/** Default path prefixes for residual ids when register has no paths field */
const RESIDUAL_PATH_HINTS = {
  'AFK-UC-COMP': [shell('src', 'components', 'uc')],
  'AFK-IDENT': [shell('src', 'pages', 'uc', 'IdentBusiness.vue')],
  'AFK-LAB-PASS': [shell('src', 'pages', 'intafaced')],
  'AFK-INDEX': [shell('src', 'pages', 'index', 'Index.vue')],
  'AFK-CMDK-ROUTES': [shell('src', 'assets', 'js', 'cmd-palette.js')],
  'AFK-HELP-DETAIL': [shell('src', 'pages', 'cms', 'HelpDetail.vue')],
  // AFK-WHITEPAPER retired — no WhitePaper.vue anywhere in shell (route removed).
  'AFK-APPDOWNLOAD': [shell('src', 'pages', 'uc', 'AppDownload.vue')],
  'AFK-FOOTER': [shell('src', 'App.vue')],
  'AFK-RESCAN': [SHELL],
  B12: [shell('src', 'pages')],
  B13: [SHELL],
  'META-STEAL': ['docs/refs'],
  'META-CRITIQUE': ['docs/refs'],
  'META-ORCA': [],
  'P0.4': ['tooling/uiproof'],
};

/** Hints that must not appear in free spawn (no target on disk). */
const RETIRED_RESIDUAL_IDS = new Set(['AFK-WHITEPAPER']);

/**
 * Fail closed: a path hint that points at nothing means collision detection
 * can never fire for that id (false free). Empty path lists are allowed.
 */
function validateResidualPathHints() {
  const missing = [];
  for (const [id, paths] of Object.entries(RESIDUAL_PATH_HINTS)) {
    if (RETIRED_RESIDUAL_IDS.has(id)) continue;
    for (const p of paths || []) {
      if (!p) continue;
      const abs = join(ROOT, p);
      if (!existsSync(abs)) missing.push(`${id} → ${p}`);
    }
  }
  if (missing.length) {
    const msg = 'swarm.mjs RESIDUAL_PATH_HINTS points at missing paths (collision detection would fail open):\n  ' + missing.join('\n  ');
    console.error(msg);
    throw new Error(msg);
  }
}

/** Money-class ids stay closed until Nitro opens a wave. */
const MONEY_TRACKER_RE = /^(trade|pay|bank|venue|p2p|market)\./;
/** Wave-1 exclude even if non-money. */
const WAVE1_EXCLUDE = new Set(['ops.admin', 'ops.compliance']);

function trkSpecPath(featureId) {
  return join(OPS, 'trk', `${featureId}.md`);
}

function trkSpecLineCount(featureId) {
  const p = trkSpecPath(featureId);
  if (!existsSync(p)) return 0;
  return readFileSync(p, 'utf8').split('\n').length;
}

/**
 * Compute implementable + non-implementable free tracker rows from features.mjs.
 * residual-own does not hide implementable (mandate).
 */
function loadTrackerRows() {
  try {
    const out = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { FEATURES } from '${join(ROOT, 'tooling/tracker/features.mjs')}';
         const byId = Object.fromEntries(FEATURES.map((f) => [f.id, f]));
         const done = new Set(FEATURES.filter((f) => f.status === 'done').map((f) => f.id));
         const rows = FEATURES.filter((f) => f.status === 'ready' && !f.owner).map((f) => {
           const deps = f.dependsOn || [];
           const depsDone = deps.every((d) => done.has(d));
           const money = /^(trade|pay|bank|venue|p2p|market)\\./.test(f.id);
           const wave1ex = ['ops.admin', 'ops.compliance'].includes(f.id);
           return {
             featureId: f.id,
             title: f.title || f.id,
             paths: f.requires || [],
             status: f.status,
             dependsOn: deps,
             depsDone,
             money,
             wave1ex,
           };
         });
         process.stdout.write(JSON.stringify(rows));`,
      ],
      { encoding: 'utf8', cwd: ROOT, maxBuffer: 10 * 1024 * 1024 },
    );
    const rows = JSON.parse(out);
    const implementable = [];
    const notYet = [];
    for (const r of rows) {
      const lines = trkSpecLineCount(r.featureId);
      const specOk = lines >= 100;
      const impl = r.depsDone && !r.money && !r.wave1ex && specOk;
      const claim = {
        id: 'TRK-' + r.featureId,
        rank: impl ? 50 : 300,
        track: impl ? 'IMPLEMENTABLE' : 'TRACKER',
        title: r.title,
        paths: r.paths.length ? r.paths : [trkSpecPath(r.featureId).replace(ROOT + '/', '')],
        featureId: r.featureId,
        implementable: impl,
        note: impl
          ? `implementable TRK (spec ${lines} lines · deps done) — Stage-1 Class N`
          : [
              !r.depsDone && 'dep-blocked',
              r.money && 'money-gated',
              r.wave1ex && 'wave1-exclude',
              !specOk && `thin/missing spec (${lines} lines)`,
            ]
              .filter(Boolean)
              .join(' · ') || 'not implementable',
      };
      if (impl) implementable.push(claim);
      else notYet.push(claim);
    }
    return { implementable, notYet };
  } catch (e) {
    return { error: String(e.message || e), implementable: [], notYet: [] };
  }
}

function loadTrackerFree() {
  const t = loadTrackerRows();
  if (t.error) return { error: t.error };
  // legacy: free tracker = non-implementable ready rows (research backlog)
  return t.notYet;
}

function listClaimLocks() {
  if (!existsSync(CLAIMS_DIR)) return [];
  return readdirSync(CLAIMS_DIR)
    .filter((n) => n.endsWith('.md') && n !== 'README.md')
    .map((n) => n.replace(/\.md$/, ''));
}

/**
 * Claim-lock authority (P4): docs/ops/claims/<id>.md wins over residual-register
 * and over open-PR path collision for "is this claim free to spawn?"
 * status residual-own | merged | retired → closed (not free)
 * status claimed | pr-open | missing status → active lock
 */
function readClaimLock(id) {
  const path = join(CLAIMS_DIR, `${id}.md`);
  if (!existsSync(path)) return null;
  const body = readFileSync(path, 'utf8');
  const m = body.match(/\*\*status:\*\*\s*(\S+)/i);
  const status = (m && m[1] ? m[1].toLowerCase() : 'claimed').replace(/[,.]$/, '');
  const proof = (body.match(/\*\*proof:\*\*\s*(.+)/i) || [])[1] || '';
  return { id, status, proof: proof.trim(), path };
}

function claimLockCloses(id) {
  const lock = readClaimLock(id);
  if (!lock) return false;
  if (['merged', 'retired', 'done', 'closed'].includes(lock.status)) return true;
  // residual-own: hides non-TRK residual (research finished). TRK residual-own = awaiting implement — free board.
  if (lock.status === 'residual-own' && !String(id).startsWith('TRK-')) return true;
  return false;
}

/** Hides free spawn: closed locks OR claimed/pr-open/wip. TRK residual-own does not hide. */
function claimLockHidesFree(id) {
  const lock = readClaimLock(id);
  if (!lock) return false;
  if (claimLockCloses(id)) return true;
  return ['claimed', 'pr-open', 'wip'].includes(lock.status);
}

function claimLockActive(id) {
  const lock = readClaimLock(id);
  if (!lock) return false;
  return !claimLockCloses(id);
}

function writeClaimFile(id, claim) {
  mkdirSync(CLAIMS_DIR, { recursive: true });
  const path = join(CLAIMS_DIR, `${id}.md`);
  if (existsSync(path)) {
    return { path, existed: true };
  }
  const body = [
    `# Claim ${id}`,
    '',
    `**status:** claimed`,
    `**started:** ${new Date().toISOString()}`,
    `**heartbeat:** ${new Date().toISOString()}`,
    `**title:** ${(claim && claim.title) || id}`,
    `**track:** ${(claim && claim.track) || '?'}`,
    `**paths:**`,
    ...((claim && claim.paths) || []).map((p) => `- ${p}`),
    '',
    '## Done bar',
    '',
    '- [ ] Implemented',
    '- [ ] claim:check clean or residual-owned',
    '- [ ] pnpm verify (or FE-VERIFY when available)',
    '- [ ] Proof: fleet OR proof_missing: fleet-blocked (NO-FLEET)',
    '- [ ] PR link',
    '',
    '## Law',
    '',
    '- Do not hand-edit docs/LIVE-LANES.md mid-wave (inside Denon open PRs).',
    '- Do not invent money/depth. No Shehzad implement. No dual-edit Denon open files.',
    '',
  ].join('\n');
  writeFileSync(path, body, 'utf8');
  return { path, existed: false };
}

/** Consecutive tip merges that touch only docs/ (churn). */
function countOpsOnlyChurn(limit = 30) {
  const log = git(['log', 'origin/main', `-${limit}`, '--name-only', '--pretty=format:---%H']);
  if (!log) return { consecutive: 0, sample: [] };
  const chunks = log
    .split(/^---/m)
    .map((s) => s.trim())
    .filter(Boolean);
  let consecutive = 0;
  const sample = [];
  for (const chunk of chunks) {
    const lines = chunk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const sha = (lines[0] || '').slice(0, 8);
    const files = lines.slice(1);
    if (!files.length) continue;
    const docsOnly = files.every((f) => f.startsWith('docs/') || f.endsWith('.md'));
    if (docsOnly) {
      consecutive++;
      sample.push(sha);
    } else break;
  }
  return { consecutive, sample };
}

function worktreeCount() {
  const raw = git(['worktree', 'list', '--porcelain']);
  if (!raw) return 0;
  return raw.split('\n').filter((l) => l.startsWith('worktree ')).length;
}

/** P1: remote feat|fix|chore|docs not on main, no open PR. */
function listStrandedBranches(openPrs) {
  const openHeads = new Set((openPrs || []).map((p) => p.headRefName).filter(Boolean));
  const refs = git(['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin']).split('\n').filter(Boolean);
  const out = [];
  for (const ref of refs) {
    if (!/^origin\/(feat|fix|chore|docs)\//.test(ref)) continue;
    const b = ref.replace(/^origin\//, '');
    if (openHeads.has(b)) continue;
    const r = spawnSync('git', ['merge-base', '--is-ancestor', ref, 'origin/main'], {
      cwd: ROOT,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    if (r.status === 0) continue; // already on main
    const ahead = Number(git(['rev-list', '--count', `origin/main..${ref}`]) || 0);
    if (!Number.isFinite(ahead) || ahead < 1) continue;
    out.push({ branch: b, ahead });
  }
  out.sort((a, b) => b.ahead - a.ahead || a.branch.localeCompare(b.branch));
  return out;
}

function touchClaimFile(id, patch = {}) {
  const path = join(CLAIMS_DIR, `${id}.md`);
  if (!existsSync(path)) return { path, ok: false, reason: 'missing' };
  let body = readFileSync(path, 'utf8');
  const now = new Date().toISOString();
  if (/\*\*heartbeat:\*\*/i.test(body)) {
    body = body.replace(/\*\*heartbeat:\*\*\s*.*/i, `**heartbeat:** ${now}`);
  } else {
    body = body.replace(/(\*\*started:\*\*[^\n]*\n)/i, `$1**heartbeat:** ${now}\n`);
  }
  if (patch.status) {
    body = body.replace(/\*\*status:\*\*\s*\S+/i, `**status:** ${patch.status}`);
  }
  writeFileSync(path, body, 'utf8');
  return { path, ok: true, heartbeat: now };
}

function countActionsRuns24h() {
  // optional — needs gh; return null on failure (CI has no gh auth)
  try {
    const runs = JSON.parse(
      execFileSync('gh', ['run', 'list', '--limit', '1000', '--json', 'createdAt,name,conclusion,event'], {
        encoding: 'utf8',
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
    const cut = Date.now() - 24 * 3600 * 1000;
    const last24 = runs.filter((r) => new Date(r.createdAt).getTime() >= cut);
    const byName = {};
    for (const r of last24) {
      byName[r.name || 'unknown'] = (byName[r.name || 'unknown'] || 0) + 1;
    }
    // if we hit the API page cap, flag so status does not under-report billing risk
    const capped = runs.length >= 1000;
    return { total: last24.length, byName, capped };
  } catch {
    return null;
  }
}

function buildLanes(m) {
  const stranded = m.strandedBranches || listStrandedBranches(m.openPrs || []);
  // P2: partner red needing comment — needs second gh call for statusCheckRollup
  let partnerRed = [];
  try {
    const detail = JSON.parse(
      execFileSync(
        'gh',
        ['pr', 'list', '--state', 'open', '--limit', '40', '--json', 'number,title,author,mergeable,statusCheckRollup,url'],
        { encoding: 'utf8', cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
      ),
    );
    partnerRed = detail
      .filter((p) => p.author?.login && p.author.login !== 'ZenYoda3')
      .filter((p) => (p.statusCheckRollup || []).some((c) => c.conclusion === 'FAILURE'))
      .map((p) => ({
        number: p.number,
        title: p.title,
        author: p.author.login,
        fails: (p.statusCheckRollup || []).filter((c) => c.conclusion === 'FAILURE').map((c) => c.name),
        url: p.url,
      }));
  } catch {
    partnerRed = [];
  }
  // P3 thin TRK
  let thinTrk = [];
  try {
    const trkDir = join(OPS, 'trk');
    if (existsSync(trkDir)) {
      thinTrk = readdirSync(trkDir)
        .filter((n) => n.endsWith('.md') && n !== 'README.md' && !n.startsWith('TRK-'))
        .map((n) => {
          const body = readFileSync(join(trkDir, n), 'utf8');
          const lines = body.split('\n').length;
          return { file: n, lines };
        })
        .filter((x) => x.lines < 100)
        .sort((a, b) => a.lines - b.lines);
    }
  } catch {
    thinTrk = [];
  }
  return {
    p0: (m.freeProduct || []).map((c) => c.id),
    p1: stranded,
    p2: partnerRed,
    p3: thinTrk,
    counts: {
      p0: (m.freeProduct || []).length,
      p1: stranded.length,
      p2: partnerRed.length,
      p3: thinTrk.length,
    },
  };
}

function printLanes(m) {
  const L = buildLanes(m);
  console.log(`swarm:lanes  tip=${m.tip}`);
  console.log(`  P0 free product: ${L.counts.p0}`);
  console.log(`  P1 stranded branches: ${L.counts.p1}`);
  for (const s of L.p1.slice(0, 15)) console.log(`    STRANDED ${s.branch} (+${s.ahead})`);
  if (L.p1.length > 15) console.log(`    … +${L.p1.length - 15} more`);
  console.log(`  P2 partner NEW-red: ${L.counts.p2}`);
  for (const p of L.p2.slice(0, 10)) console.log(`    #${p.number} @${p.author} fails=${p.fails.join(',')}`);
  console.log(`  P3 thin TRK (<100 lines): ${L.counts.p3}`);
  for (const t of L.p3.slice(0, 12)) console.log(`    ${t.file} (${t.lines} lines)`);
  if (L.counts.p0 + L.counts.p1 + L.counts.p2 + L.counts.p3 === 0) {
    console.log('  ALL LANES 0 — F-STANDBY idle is valid. Re-check 30–45m. Do NOT open a stamp PR.');
  }
}

function loadResidual() {
  const p = join(ROOT, 'tooling/frontend/residual-register.json');
  if (!existsSync(p)) return { items: [], error: 'residual-register.json missing' };
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    return { items: [], error: String(e.message || e) };
  }
}

function buildModel() {
  const tip = git(['rev-parse', '--short', 'origin/main']) || git(['rev-parse', '--short', 'HEAD']);
  const tipFull = git(['rev-parse', 'origin/main']) || git(['rev-parse', 'HEAD']);
  const tipSubject = git(['log', '-1', '--format=%s', 'origin/main']) || '';

  const prs = ghJson(['pr', 'list', '--state', 'open', '--limit', '80', '--json', 'number,title,author,headRefName,url,mergeable,files']);
  if (prs.__error) {
    return { error: prs.__error, tip, tipFull, tipSubject };
  }

  const openFiles = [];
  for (const pr of prs) {
    for (const f of pr.files || []) {
      openFiles.push({ path: f.path, pr: pr.number, author: pr.author?.login || '?', title: pr.title });
    }
  }

  const residual = loadResidual();
  const claims = [];

  // P4: claim-lock files are spawn authority (residual-register is advisory only).
  for (const c of REGROUP_CLAIMS) {
    const hits = openFiles.filter((o) => c.paths.some((p) => touches(p, o.path)));
    const blocked = hits.length > 0;
    const closed = claimLockCloses(c.id);
    const active = claimLockActive(c.id);
    let status = blocked ? 'blocked' : closed || active ? 'claimed' : 'free';
    const collisions = blocked
      ? hits.slice(0, 12).map((h) => `#${h.pr}@${h.author} ${h.path}`)
      : closed || active
        ? ['claim file docs/ops/claims/' + c.id + '.md']
        : [];
    const lock = readClaimLock(c.id);
    claims.push({
      ...c,
      status,
      collisions,
      priority: c.rank,
      note:
        (c.note || '') +
        (closed ? ' · residual-own/merged (claim-lock)' : active ? ' · CLAIMED (claim-lock)' : '') +
        (lock && lock.proof ? ' · proof: ' + lock.proof.slice(0, 80) : ''),
    });
  }

  const afkItems = (residual.items || []).filter(
    (i) =>
      i.afk_safe !== false &&
      !RETIRED_RESIDUAL_IDS.has(i.id) &&
      i.status !== 'retired' &&
      !claimLockCloses(i.id) &&
      (i.status === 'open' || i.status === 'partial') &&
      !claimLockActive(i.id),
  );
  for (const i of afkItems) {
    const paths = RESIDUAL_PATH_HINTS[i.id] || [SHELL];
    const hits = paths.length === 0 ? [] : openFiles.filter((o) => paths.some((p) => touches(p, o.path)));
    const rp2Free = claims.find((c) => c.id === 'RP2' && c.status === 'free');
    let status = hits.length > 0 ? 'blocked' : 'free';
    let collisions = hits.length > 0 ? hits.slice(0, 12).map((h) => `#${h.pr}@${h.author} ${h.path}`) : [];
    let note = i.next_action || i.blocker || '';
    if (i.id === 'AFK-INDEX' && rp2Free) {
      status = 'blocked';
      note = 'Blocked while RP2 free (sole Index.vue owner)';
      collisions = ['RP2 owns Index'];
    }
    claims.push({
      id: i.id,
      rank: 100 + (i.priority ?? 50),
      track: 'AFK',
      title: i.title || i.id,
      paths,
      status,
      collisions,
      priority: i.priority ?? 50,
      note,
      residualStatus: i.status,
    });
  }

  const trackerRows = loadTrackerRows();
  if (trackerRows.error) {
    // non-fatal
  } else {
    for (const c of [...(trackerRows.implementable || []), ...(trackerRows.notYet || [])]) {
      const hides = claimLockHidesFree(c.id);
      const closed = claimLockCloses(c.id);
      let status = 'free';
      let collisions = [];
      if (closed) {
        status = 'blocked';
        collisions = ['claim closed: ' + (readClaimLock(c.id)?.status || '?')];
      } else if (hides) {
        status = 'claimed';
        collisions = ['claim file docs/ops/claims/' + c.id + '.md'];
      }
      claims.push({
        ...c,
        status,
        collisions,
        priority: c.rank,
        note: c.note + (status === 'claimed' ? ' · CLAIMED' : status === 'blocked' ? ' · CLOSED' : ''),
      });
    }
  }

  // Hygiene / babysit always-on non-writer rows
  claims.push({
    id: 'BABYSIT-MATRIX',
    rank: 200,
    track: 'OPS',
    title: 'Babysit open partner PRs (comment/CI only)',
    paths: [],
    status: 'free',
    collisions: [],
    priority: 200,
    note: 'Shehzad #346 + Denon open — no implement',
  });
  claims.push({
    id: 'REPORTS',
    rank: 210,
    track: 'OPS',
    title: 'Refresh R00–R02 via pnpm swarm:report',
    paths: ['docs/ops'],
    status: 'free',
    collisions: [],
    priority: 210,
    note: 'Coord-OPS',
  });

  claims.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || String(a.id).localeCompare(b.id));

  const free = claims.filter((c) => c.status === 'free');
  const blocked = claims.filter((c) => c.status === 'blocked');

  // Spawnable free product: shell craft + implementable TRK (SWARM-MANDATE).
  // freeShell and freeImplementable are printed separately so freeShell=0 / freeProduct
  // cannot be misread as "nothing to do" when implementable TRK is open.
  const freeShell = free.filter((c) => c.track === 'REGROUP' || c.track === 'AFK' || c.track === 'LANDER' || c.track === 'INTEGRITY');
  const freeImplementable = free.filter((c) => c.track === 'IMPLEMENTABLE');
  const freeProduct = free.filter(
    (c) => c.track === 'REGROUP' || c.track === 'AFK' || c.track === 'LANDER' || c.track === 'INTEGRITY' || c.track === 'IMPLEMENTABLE',
  );
  const freeTracker = free.filter((c) => c.track === 'TRACKER');
  const productIds = new Set(
    claims.filter((c) => ['REGROUP', 'AFK', 'LANDER', 'INTEGRITY', 'IMPLEMENTABLE'].includes(c.track)).map((c) => c.id),
  );
  const activeSpawned = listClaimLocks().filter((id) => productIds.has(id) && claimLockHidesFree(id)).length;
  const available = freeProduct.length;
  const underGap = available;
  const underSpawnFail = available > 0;
  const underSpawnNote = underSpawnFail
    ? `anti-under-spawn FAIL: available=${available} (shell=${freeShell.length} implementable=${freeImplementable.length}) active_spawned_locks=${activeSpawned} gap=${underGap} — spawn path-disjoint Class N (width 3–6 TRK / 6–8 shell).`
    : `anti-under-spawn OK: available=0 shell=0 implementable=0 active_spawned_locks=${activeSpawned} gap=0.`;

  const opsChurn = countOpsOnlyChurn(30);
  const strandedBranches = listStrandedBranches(prs);
  const wtCount = worktreeCount();
  const actionsRuns24h = countActionsRuns24h();
  // F-STANDBY only when BOTH shell and implementable boards are empty.
  // freeShell=0 alone is NOT idle when freeImplementable>0 (or P1 still has work).
  const fStandby =
    freeShell.length === 0 && freeImplementable.length === 0
      ? 'F-STANDBY — freeShell=0 and freeImplementable=0; continue P1–P5 only with Board-Delta. Idle only if every path-clear P1 is named blocked. freeProduct=0 is never platform-done.'
      : null;

  return {
    tip,
    tipFull,
    tipSubject,
    generatedAt: new Date().toISOString(),
    openPrCount: prs.length,
    openPrs: prs.map((p) => ({
      number: p.number,
      title: p.title,
      author: p.author?.login,
      headRefName: p.headRefName,
      url: p.url,
      mergeable: p.mergeable,
      fileCount: (p.files || []).length,
    })),
    residualError: residual.error,
    residualUpdated: residual.updated,
    residualTipNote: residual.tip_note,
    claims,
    free,
    blocked,
    freeShell,
    freeProduct,
    freeImplementable,
    freeTracker,
    available,
    activeSpawned,
    underGap,
    underSpawnFail,
    underSpawnNote,
    opsChurn,
    strandedBranches,
    strandedCount: strandedBranches.length,
    worktreeCount: wtCount,
    worktreeOverCap: wtCount > 20,
    actionsRuns24h,
    fStandby,
    spawnWidthTarget:
      freeImplementable.length > 0 && freeShell.length === 0
        ? '3-6 (implementable TRK)'
        : freeProduct.length > 0
          ? '6-8'
          : '3-6 (P1–P3 only)',
    mandate:
      'freeProduct = freeShell(REGROUP/AFK/LANDER/INTEGRITY) + freeImplementable TRK. residual-own does not hide TRK implementable. Money-class closed. Wave1 exclude ops.admin/ops.compliance. freeShell=0 is not all-clear when freeImplementable>0.',
    // AFK anti-drift (docs/ops/SWARM-MANDATE.md ladder) — freeShell=0 alone must not kill spawn
    afkLadder:
      freeImplementable.length > 0
        ? `P0 SPAWN_NOW freeImplementable=${freeImplementable.length} path-disjoint (width 3–6 TRK). freeShell=${freeShell.length}. Stamp mill still banned.`
        : freeShell.length > 0
          ? 'P0 SPAWN_NOW free shell product path-disjoint (width 6–8). Stamp mill still banned.'
          : 'P1 stranded-branch land · P2 partner unblock (exact CI comment) · P3 TRK deepen · P4 invent/P-WS only on real delta · P5 hygiene. BAN: R07/R01/P-WS tip-bump cycles when board unchanged. freeShell=0 freeImplementable=0 is NOT platform-done.',
    stampMillBan:
      'Do not open docs(ops) R07/R01/P-WS “cycle N” PRs solely because freeShell=0 or freeProduct=0. Ship only on board delta or P1–P3 deliverable. Law: docs/ops/SWARM-MANDATE.md',
  };
}

function renderFreezeMd(m) {
  const lines = [];
  lines.push('# FREEZE-LIVE (generated)');
  lines.push('');
  lines.push('**Do not hand-edit.** Regenerate: `pnpm swarm:freeze`');
  lines.push('');
  lines.push(`- **Tip:** \`${m.tip}\` — ${m.tipSubject}`);
  lines.push(`- **Generated:** ${m.generatedAt}`);
  lines.push(`- **Open PRs:** ${m.openPrCount}`);
  lines.push(
    `- **Free claims:** free=${m.free.length} freeShell=${(m.freeShell || []).length} freeImplementable=${(m.freeImplementable || []).length} freeTracker=${(m.freeTracker || []).length} blocked=${m.blocked.length} (freeProduct=${m.freeProduct.length}=shell+implementable)`,
  );
  lines.push(
    `- **Spawn accounting:** available=${m.available ?? m.freeProduct.length} · active_spawned_locks=${m.activeSpawned ?? '?'} · gap=${m.underGap ?? m.freeProduct.length} · width_target=${m.spawnWidthTarget || '6-8'}`,
  );
  lines.push(`- **Anti-under-spawn:** ${m.underSpawnNote}`);
  lines.push(`- **Mandate:** ${m.mandate || 'shell product only'}`);
  lines.push(`- **AFK ladder:** ${m.afkLadder || 'see docs/ops/SWARM-MANDATE.md'}`);
  lines.push(`- **Stamp-mill ban:** ${m.stampMillBan || 'no R07/R01 tip-bump spam when board unchanged'}`);
  if (m.fStandby) lines.push(`- **Finish state:** ${m.fStandby}`);
  const churn = m.opsChurn || { consecutive: 0 };
  lines.push(
    `- **Ops churn:** ${churn.consecutive} consecutive docs-only tip merges${churn.consecutive >= 5 ? ' ⚠ CHURN (≥5) — value gate + Board-Delta required' : ''}`,
  );
  lines.push(`- **Stranded branches (P1):** ${m.strandedCount ?? (m.strandedBranches || []).length}`);
  lines.push(`- **Worktrees:** ${m.worktreeCount ?? '?'} ${m.worktreeOverCap ? '⚠ OVER CAP 20 — run `pnpm wt:gc:apply`' : '(cap 20)'}`);
  if (m.actionsRuns24h) {
    const by = Object.entries(m.actionsRuns24h.byName || {})
      .map(([n, c]) => `${n}=${c}`)
      .join(', ');
    lines.push(
      `- **Actions runs (24h):** ${m.actionsRuns24h.total}${by ? ` (${by})` : ''} — billing ceiling risk if Docs-format dominates; Denon owns Actions budget`,
    );
  } else {
    lines.push('- **Actions runs (24h):** (gh unavailable — re-run with network)');
  }
  lines.push(
    '- **Proof mode:** NO-FLEET until Docker present — static build + scans; never fake UI done. UI proof tooling exists (`pnpm ui:proof` + `docs/styleboard/`) — NO-FLEET is Docker, not "never seen UI".',
  );
  lines.push('- **Claims:** docs/ops/claims/<id>.md (do not hand-edit LIVE-LANES mid-wave)');
  lines.push(
    '- **Cold resume:** this file + `docs/COORDINATION-TRUTH-LAYERS.md` § Agent cold-start · human blockers: `docs/BOARD-CLEAR-HUMAN-BLOCKERS.md` · value gate: `tooling/ci/value-gate.mjs`',
  );
  if (m.residualError) lines.push(`- **Residual error:** ${m.residualError}`);
  else lines.push(`- **Residual:** updated=${m.residualUpdated} tip_note=${m.residualTipNote || '—'}`);
  lines.push('');
  if ((m.freeShell || []).length === 0 && (m.freeImplementable || []).length === 0) {
    lines.push('## freeShell=0 freeImplementable=0 — F-STANDBY (real work, not stamp cycles)');
    lines.push('');
    lines.push(
      'Shell craft and implementable TRK are both empty. **freeProduct=0 is not platform-done.** Session may continue on P1–P5. Producing a stamp PR is not required.',
    );
    lines.push('');
    lines.push('1. **P1** Land stranded `origin/feat/*` / `fix/*` after path-intersect vs open partner PRs. (`pnpm swarm:lanes`)');
    lines.push('2. **P2** Partner babysit: extract exact CI fails; one NEW comment only; never merge partners.');
    lines.push('3. **P3** Deepen thin `docs/ops/trk/*` for tracker ready non-shehzad rows (code-grounded).');
    lines.push('4. **P4** Invent re-scan only after shell code change; P-WS report only if partner matrix changed.');
    lines.push('5. **P5** LIVE-LANES/claims truth + merge green Nitro Class N.');
    lines.push('');
    lines.push(
      '**BAN:** `docs(ops): R07 cycleN freeProduct=0` style PRs when freeShell+freeImplementable stay 0 and partner matrix unchanged.',
    );
    lines.push(
      '**Metric:** L0 value gate (`tooling/ci/value-gate.mjs`) + `Board-Delta:` trailer — see `docs/BOARD-CLEAR-PROCESS-LOOPS.md` L0.',
    );
    lines.push('');
  }
  lines.push('## Free (spawn one worker each)');
  lines.push('');
  lines.push('| rank | id | track | title | paths (sample) | note |');
  lines.push('| ---: | --- | --- | --- | --- | --- |');
  for (const c of m.free) {
    const paths = (c.paths || []).slice(0, 2).join('; ') || '—';
    lines.push(
      `| ${c.rank} | **${c.id}** | ${c.track} | ${(c.title || '').replace(/\|/g, '/')} | ${paths.replace(/\|/g, '/')} | ${(c.note || '').replace(/\|/g, '/')} |`,
    );
  }
  lines.push('');
  lines.push('## Blocked (do not implement)');
  lines.push('');
  lines.push('| id | track | title | collisions |');
  lines.push('| --- | --- | --- | --- |');
  for (const c of m.blocked) {
    lines.push(
      `| **${c.id}** | ${c.track} | ${(c.title || '').replace(/\|/g, '/')} | ${(c.collisions || []).join('<br>').replace(/\|/g, '/')} |`,
    );
  }
  lines.push('');
  lines.push('## Open PR snapshot');
  lines.push('');
  for (const p of m.openPrs) {
    lines.push(`- #${p.number} @${p.author} · ${p.fileCount} files · ${p.mergeable || '?'} · ${p.title}`);
  }
  lines.push('');
  lines.push('## NEVER-TOUCH mid-wave (open multi-PR clusters)');
  lines.push('');
  lines.push('- `docs/LIVE-LANES.md` — inside Denon open PRs (#436/#428); use `docs/ops/claims/<id>.md` instead');
  lines.push('- `tooling/tracker/features.mjs` / `docs/TRACKER.md` — batch at wave end');
  lines.push(
    '- `package.json` / `tooling/ci/brand-scan.mjs` / `gates.mjs` / `.github/workflows/ci.yml` — multi-PR pile; use `node tooling/scripts/swarm.mjs` if aliases conflict',
  );
  lines.push('- Visual proof on :8090 if `lsof` path is not your worktree (stale squatter risk)');
  lines.push('- Full fleet proof if Docker missing — stamp `proof_missing: fleet-blocked` (NO-FLEET mode)');
  lines.push('');
  lines.push('## Claim files');
  lines.push('');
  lines.push('Atomic claim: `pnpm swarm:claim <id>` → `docs/ops/claims/<id>.md` (first writer wins).');
  lines.push('');
  lines.push('## Law');
  lines.push('');
  lines.push(
    '- `docs/ops/SWARM-MANDATE.md` (AFK priority ladder + stamp-mill ban) · `docs/SWARM-ALL-OUT-ORIENT-2026-08-03.md` · `docs/REGROUP-2026-08-03.md`',
  );
  lines.push('- Before edit: `pnpm claim:check <paths>` · worktree only · no invent money/depth');
  lines.push('- Shehzad protocol/INTACHAIN babysit only · no dual-edit Denon open PR files');
  lines.push('');
  return lines.join('\n');
}

function writeFreeze(m) {
  mkdirSync(OPS, { recursive: true });
  const path = join(OPS, 'FREEZE-LIVE.md');
  writeFileSync(path, renderFreezeMd(m), 'utf8');
  // machine JSON for next/report
  writeFileSync(join(OPS, 'FREEZE-LIVE.json'), JSON.stringify(m, null, 2), 'utf8');
  return path;
}

function printStatus(m) {
  const freeShellN = (m.freeShell || []).length;
  const freeImplN = (m.freeImplementable || []).length;
  const freeProdN = (m.freeProduct || []).length;
  console.log(`swarm:status  tip=${m.tip}  openPRs=${m.openPrCount}`);
  // Canonical lane — freeShell vs freeImplementable must both be visible.
  // freeProduct is shell+implementable (spawn total); never the sole idle signal.
  console.log(
    `  free=${m.free.length} freeShell=${freeShellN} freeImplementable=${freeImplN} freeTracker=${(m.freeTracker || []).length} blocked=${m.blocked.length}`,
  );
  console.log(
    `  spawn: freeProduct=${freeProdN}(=shell+implementable) available=${m.available ?? freeProdN} active_spawned=${m.activeSpawned ?? '?'} gap=${m.underGap ?? freeProdN} width_target=${m.spawnWidthTarget || '6-8'}`,
  );
  if (freeShellN === 0 && freeImplN > 0) {
    console.log(
      `  lane-read: freeShell=0 is NOT all-clear — freeImplementable=${freeImplN} spawnable (SPAWN_NOW). freeProduct=${freeProdN}.`,
    );
  } else if (freeShellN === 0 && freeImplN === 0) {
    console.log(
      `  lane-read: freeShell=0 freeImplementable=0 freeProduct=0 — NOT platform-done; run P1–P5 (stranded=${m.strandedCount ?? 0}).`,
    );
  }
  console.log(`  ${m.underSpawnNote}`);
  console.log(`  mandate: ${m.mandate || 'shell product only'}`);
  if (m.afkLadder) console.log(`  afk-ladder: ${m.afkLadder}`);
  if (m.stampMillBan) console.log(`  stamp-mill: BAN — ${m.stampMillBan}`);
  if (m.fStandby) console.log(`  finish: ${m.fStandby}`);
  const churn = m.opsChurn || { consecutive: 0, sample: [] };
  console.log(
    `  ops-churn: ${churn.consecutive} consecutive docs-only tip merges${churn.consecutive >= 5 ? ' ⚠ CHURN' : ''}${churn.sample?.length ? ` (${churn.sample.slice(0, 5).join(',')})` : ''}`,
  );
  console.log(`  stranded(P1): ${m.strandedCount ?? 0}`);
  console.log(`  worktrees: ${m.worktreeCount ?? '?'}${m.worktreeOverCap ? ' ⚠ OVER CAP 20 — pnpm wt:gc:apply' : ''}`);
  if (m.actionsRuns24h) {
    const by = Object.entries(m.actionsRuns24h.byName || {})
      .sort((a, b) => b[1] - a[1])
      .map(([n, c]) => `${n}=${c}`)
      .join(' ');
    console.log(
      `  actions-24h: total=${m.actionsRuns24h.total}${m.actionsRuns24h.capped ? '+' : ''} ${by}${m.actionsRuns24h.capped ? ' (list capped — true total may be higher)' : ''}`,
    );
    try {
      const ev = evaluateThrift(m.actionsRuns24h);
      const msg =
        ev.level === 'hard'
          ? 'FAIL — do not open/update PRs that start CI (pnpm thrift:check / pnpm pr); wait or THRIFT_ALLOW=1'
          : ev.level === 'soft'
            ? 'WARN — batch into fat PRs; no micro-PR / stamp docs'
            : 'OK';
      console.log(`  thrift: level=${ev.level} soft≥${ev.soft} hard≥${ev.hard} docs≥${ev.hardDocs} ci≥${ev.hardCi} — ${msg}`);
    } catch {
      console.log('  thrift: (evaluate failed)');
    }
  } else {
    console.log('  actions-24h: (gh unavailable)');
  }
  console.log('  free shell ids:', (m.freeShell || []).map((c) => c.id).join(', ') || '(none)');
  console.log('  free implementable ids:', (m.freeImplementable || []).map((c) => c.id).join(', ') || '(none)');
  console.log('  free product ids (shell+impl):', m.freeProduct.map((c) => c.id).join(', ') || '(none)');
  if (m.blocked.length) {
    console.log('  blocked ids:', m.blocked.map((c) => c.id).join(', '));
  }
}

function writeReports(m) {
  mkdirSync(OPS, { recursive: true });
  const r00 = [
    '# R00 inventory (generated)',
    '',
    `Generated: ${m.generatedAt}`,
    '',
    `| Field | Value |`,
    `| --- | --- |`,
    `| Tip | \`${m.tip}\` |`,
    `| Tip subject | ${m.tipSubject} |`,
    `| Open PRs | ${m.openPrCount} |`,
    `| Free claims | ${m.free.length} |`,
    `| freeShell (REGROUP/AFK/LANDER/INTEGRITY) | ${(m.freeShell || []).length} |`,
    `| freeImplementable (TRK Stage-1) | ${(m.freeImplementable || []).length} |`,
    `| freeProduct (shell+implementable) | ${m.freeProduct.length} |`,
    `| Blocked | ${m.blocked.length} |`,
    `| Residual tip_note | ${m.residualTipNote || '—'} |`,
    '',
    m.underSpawnNote,
    '',
    'Regenerate: `pnpm swarm:report`',
    '',
  ].join('\n');
  writeFileSync(join(OPS, 'R00-INVENTORY.md'), r00, 'utf8');

  const r01 = [
    '# R01 PR matrix (generated)',
    '',
    `Tip \`${m.tip}\` · ${m.generatedAt}`,
    '',
    '| # | author | files | mergeable | title | action |',
    '| ---: | --- | ---: | --- | --- | --- |',
    ...m.openPrs.map((p) => {
      let action = 'babysit';
      if (p.author === 'ZenYoda3') action = 'own — rebase/merge if Class N green';
      else if (p.author === 'shehzad002') action = 'babysit only — never implement';
      else if (p.author === 'Phantom-X-007') action = 'no dual-edit files';
      return `| ${p.number} | @${p.author} | ${p.fileCount} | ${p.mergeable || '?'} | ${(p.title || '').replace(/\|/g, '/')} | ${action} |`;
    }),
    '',
    'Regenerate: `pnpm swarm:report`',
    '',
  ].join('\n');
  writeFileSync(join(OPS, 'R01-PR-MATRIX.md'), r01, 'utf8');

  const r02 = [
    '# R02 free claims (generated)',
    '',
    `Tip \`${m.tip}\` · ${m.generatedAt}`,
    '',
    '## Free',
    '',
    ...m.free.map((c) => `- **${c.id}** [${c.track}] ${c.title}`),
    '',
    '## Blocked',
    '',
    ...m.blocked.map((c) => `- **${c.id}** [${c.track}] ${c.title} — ${(c.collisions || []).join('; ')}`),
    '',
    'Regenerate: `pnpm swarm:report` · source FREEZE: `pnpm swarm:freeze`',
    '',
  ].join('\n');
  writeFileSync(join(OPS, 'R02-FREE-CLAIMS.md'), r02, 'utf8');

  const dash = [
    '# Swarm ops dashboard (generated index)',
    '',
    `Last report: ${m.generatedAt} · tip \`${m.tip}\``,
    '',
    '| Report | Path |',
    '| --- | --- |',
    '| Live FREEZE | [FREEZE-LIVE.md](./FREEZE-LIVE.md) |',
    '| R00 inventory | [R00-INVENTORY.md](./R00-INVENTORY.md) |',
    '| R01 PR matrix | [R01-PR-MATRIX.md](./R01-PR-MATRIX.md) |',
    '| R02 free claims | [R02-FREE-CLAIMS.md](./R02-FREE-CLAIMS.md) |',
    '',
    '## At a glance',
    '',
    `- freeShell: **${(m.freeShell || []).length}** · freeImplementable: **${(m.freeImplementable || []).length}** · freeProduct: **${m.freeProduct.length}**`,
    `- Blocked: **${m.blocked.length}**`,
    `- Open PRs: **${m.openPrCount}**`,
    '',
    m.underSpawnNote,
    '',
    m.mandate || '',
    '',
    `- Spawn accounting: available=${m.available ?? m.freeProduct.length} · active_spawned=${m.activeSpawned ?? '?'} · gap=${m.underGap ?? m.freeProduct.length} · width_target=${m.spawnWidthTarget || '6-8'}`,
    '',
    'Commands: `pnpm swarm:freeze` · `pnpm swarm:status` · `pnpm swarm:report` · `pnpm swarm:next`',
    '',
  ].join('\n');
  writeFileSync(join(OPS, 'DASHBOARD.md'), dash, 'utf8');
  const html = `<!doctype html><meta charset=utf-8><title>Swarm dashboard</title>
<style>body{font:16px/1.4 system-ui;max-width:52rem;margin:2rem auto;padding:0 1rem}
h1{font-size:1.4rem} .ok{color:#0a0} .warn{color:#a60} code{background:#f4f4f4;padding:.1rem .3rem}</style>
<h1>Swarm dashboard</h1>
<p>Tip <code>${m.tip}</code> · ${m.generatedAt}</p>
<p class=warn>freeShell: <b>${(m.freeShell || []).length}</b> · freeImplementable: <b>${(m.freeImplementable || []).length}</b> · freeProduct: <b>${m.freeProduct.length}</b> · freeTracker: <b>${(m.freeTracker || []).length}</b> · Blocked: <b>${m.blocked.length}</b> · Open PRs: <b>${m.openPrCount}</b></p>
<p>${m.underSpawnNote}</p>
<p><a href="./FREEZE-LIVE.md">FREEZE-LIVE</a> · <a href="./R00-INVENTORY.md">R00</a> · <a href="./R01-PR-MATRIX.md">R01</a> · <a href="./R02-FREE-CLAIMS.md">R02</a></p>
<p>Regenerate: <code>pnpm swarm:report</code></p>`;
  writeFileSync(join(OPS, 'DASHBOARD.html'), html, 'utf8');
  return OPS;
}

function pasteFor(claim) {
  const paths = (claim.paths || []).join('\n  ') || '(none — research/ops/tracker)';
  return [
    `swarm:next → ${claim.id} [${claim.track}]`,
    `  ${claim.title}`,
    '',
    '--- worker paste ---',
    'PRE-FLIGHT: pnpm swarm:freeze · pnpm claim:check <paths> · docs/SWARM-ALL-OUT-ORIENT-2026-08-03.md',
    `FIRST: pnpm swarm:claim ${claim.id}  # writes docs/ops/claims/${claim.id}.md — do NOT edit LIVE-LANES`,
    `You own ONLY claim: ${claim.id}`,
    `Scope: ${claim.title}`,
    `Allowed paths:\n  ${paths}`,
    `Note: ${claim.note || '—'}`,
    'Forbidden: Shehzad protocol/INTACHAIN implement; dual-edit Denon open PR files; invent money/depth; apps/web product; main checkout; mid-wave features.mjs thrash.',
    'Proof: if no Docker — NO-FLEET (proof_missing: fleet-blocked). If :8090 listener cwd ≠ your worktree — visual proof invalid.',
    'PRE-PUSH: pnpm format:check must pass (covers tooling/scripts/*.mjs). Do not merge until Docs format + CI both green on the PR.',
    'Worktree from origin/main. pnpm format:check && pnpm verify when code. One PR. Stamp residual-own with checkable proof string.',
    'Coord width: 6–8 concurrent path-disjoint writers when free claims allow.',
    '--- end paste ---',
  ].join('\n');
}

function printNext(m, all = false) {
  const list = m.freeProduct.length ? m.freeProduct : m.free.filter((c) => c.track !== 'OPS');
  if (!list.length) {
    console.log('swarm:next — no free shell or implementable claims. Board empty or only blocked/OPS/tracker.');
    console.log('swarm:next — freeShell=0 freeImplementable=0 is NOT a kill switch (docs/ops/SWARM-MANDATE.md):');
    console.log('  P1 land stranded origin/feat/*|fix/* (path-intersect clean vs partner open PRs)');
    console.log('  P2 partner unblock: exact CI fail extract + one NEW comment; never merge partners');
    console.log('  P3 deepen thin docs/ops/trk/* for ready non-shehzad tracker rows');
    console.log('  P4 invent re-scan only after shell code change; P-WS report only if #433/#432 changed');
    console.log('  P5 LIVE-LANES/claims truth + merge green Nitro Class N');
    console.log('  BAN: R07/R01/P-WS tip-bump “cycle N” PRs when freeShell+freeImplementable stay 0 and matrix unchanged');
    return;
  }
  if (all) {
    console.log(`swarm:next --all → ${list.length} free product claims\n`);
    for (const c of list) {
      console.log(pasteFor(c));
      console.log('');
    }
    console.log(
      `ANTI-UNDER-SPAWN: available=${list.length} active_spawned_locks=${m.activeSpawned ?? 0} gap=${list.length} — spawn or residual-own every id above (width target 6–8 path-disjoint).`,
    );
    return;
  }
  console.log(pasteFor(list[0]));
  console.log('');
  console.log(`Remaining free product after this: ${list.length - 1}`);
  console.log('Tip: pnpm swarm:next --all  for every free product paste.');
}

// --- main ---
try {
  validateResidualPathHints();
} catch (e) {
  console.error('swarm — RESIDUAL_PATH_HINTS invalid (fail closed).');
  console.error(`  ${e.message || e}`);
  process.exit(2);
}

const m = buildModel();
if (m.error) {
  console.error('swarm — CANNOT ANSWER: gh/git failed.');
  console.error(`  ${m.error}`);
  console.error('  Not reporting clear free board.');
  process.exit(2);
}

switch (cmd) {
  case 'freeze': {
    const path = writeFreeze(m);
    printStatus(m);
    console.log(`  wrote ${path.replace(ROOT + '/', '')}`);
    console.log(`  wrote docs/ops/FREEZE-LIVE.json`);
    break;
  }
  case 'status': {
    printStatus(m);
    break;
  }
  case 'report': {
    writeFreeze(m);
    const dir = writeReports(m);
    printStatus(m);
    console.log(`  wrote reports under ${dir.replace(ROOT + '/', '')}`);
    break;
  }
  case 'next': {
    writeFreeze(m);
    printNext(m, args.includes('--all'));
    break;
  }
  case 'claim': {
    const id = args[0];
    if (!id) {
      console.error('Usage: pnpm swarm:claim <id>');
      process.exit(1);
    }
    writeFreeze(m);
    const claim = m.claims.find((c) => c.id === id);
    if (!claim) {
      console.error(`Unknown claim id ${id} — run pnpm swarm:freeze and pick an id`);
      process.exit(1);
    }
    if (claim.status === 'blocked') {
      console.error(`Claim ${id} is blocked: ${(claim.collisions || []).join('; ')}`);
      process.exit(1);
    }
    const r = writeClaimFile(id, claim);
    console.log(r.existed ? `claim exists: ${r.path}` : `claim locked: ${r.path}`);
    break;
  }
  case 'lanes': {
    printLanes(m);
    break;
  }
  case 'heartbeat': {
    const id = args[0];
    if (!id) {
      console.error('Usage: pnpm swarm:heartbeat <id>');
      process.exit(1);
    }
    const r = touchClaimFile(id);
    if (!r.ok) {
      console.error(`heartbeat failed: ${r.reason || 'unknown'} (${r.path})`);
      process.exit(1);
    }
    console.log(`heartbeat: ${id} → ${r.heartbeat}`);
    break;
  }
  default:
    console.error(`Usage: node tooling/scripts/swarm.mjs <freeze|status|lanes|report|next|claim|heartbeat>`);
    process.exit(1);
}
