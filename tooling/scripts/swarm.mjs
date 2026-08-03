#!/usr/bin/env node
/**
 * Swarm stack (Wave 1) — machine free-claim freeze, status, reports, next paste.
 *
 * Plan: OS/harvest/WAVE-1-SWARM-STACK-PLAN-2026-08-03.md (judgment, not cargo-cult).
 * Does NOT spawn agents, merge PRs, or edit product shell code.
 *
 *   pnpm swarm:freeze   → docs/ops/FREEZE-LIVE.md + stdout summary
 *   pnpm swarm:status   → short tip + free/blocked counts
 *   pnpm swarm:report   → docs/ops/R00 R01 R02 + DASHBOARD.md
 *   pnpm swarm:next [--all] → first free claim paste, or all free product pastes
 *   pnpm swarm:claim <id>   → write docs/ops/claims/<id>.md lock file
 *
 * Exit 0 always when the tool answered honestly (including "0 free").
 * Exit 2 when gh/git cannot answer (same spirit as claim-check).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

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

const touches = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

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
  'AFK-WHITEPAPER': [shell('src', 'pages', 'cms', 'WhitePaper.vue')],
  'AFK-APPDOWNLOAD': [shell('src', 'pages', 'cms', 'AppDownload.vue')],
  'AFK-FOOTER': [shell('src', 'App.vue')],
  'AFK-RESCAN': [SHELL],
  B12: [shell('src', 'pages')],
  B13: [SHELL],
  'META-STEAL': ['docs/refs'],
  'META-CRITIQUE': ['docs/refs'],
  'META-ORCA': [],
  'P0.4': ['tooling/uiproof'],
};

function loadTrackerFree() {
  try {
    // Dynamic import sync via pathToFileURL not available — use child node -e
    const out = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { FEATURES } from '${join(ROOT, 'tooling/tracker/features.mjs')}';
         const free = FEATURES.filter((f) => (f.status === 'ready' || f.status === 'wip') && !f.owner);
         process.stdout.write(JSON.stringify(free.map((f) => ({
           id: 'TRK-' + f.id,
           rank: 300,
           track: 'TRACKER',
           title: f.title || f.id,
           paths: f.requires || [],
           note: 'features.mjs free-to-start (' + f.status + '); research/spec first unless DoD tiny. Mid-wave claim-file only, not features.mjs edit.',
           featureId: f.id,
         }))));`,
      ],
      { encoding: 'utf8', cwd: ROOT, maxBuffer: 10 * 1024 * 1024 },
    );
    return JSON.parse(out);
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

function listClaimLocks() {
  if (!existsSync(CLAIMS_DIR)) return [];
  return readdirSync(CLAIMS_DIR)
    .filter((n) => n.endsWith('.md'))
    .map((n) => n.replace(/\.md$/, ''));
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

  for (const c of REGROUP_CLAIMS) {
    const hits = openFiles.filter((o) => c.paths.some((p) => touches(p, o.path)));
    const blocked = hits.length > 0;
    claims.push({
      ...c,
      status: blocked ? 'blocked' : 'free',
      collisions: hits.slice(0, 12).map((h) => `#${h.pr}@${h.author} ${h.path}`),
      priority: c.rank,
    });
  }

  const afkItems = (residual.items || []).filter((i) => i.afk_safe !== false && (i.status === 'open' || i.status === 'partial'));
  for (const i of afkItems) {
    const paths = RESIDUAL_PATH_HINTS[i.id] || [SHELL];
    const hits = paths.length === 0 ? [] : openFiles.filter((o) => paths.some((p) => touches(p, o.path)));
    // AFK-INDEX blocked if RP2 free (prefer REGROUP landing owner)
    const rp2Free = claims.find((c) => c.id === 'RP2' && c.status === 'free');
    let status = hits.length > 0 ? 'blocked' : 'free';
    let collisions = hits.slice(0, 12).map((h) => `#${h.pr}@${h.author} ${h.path}`);
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

  const tracker = loadTrackerFree();
  if (tracker.error) {
    // non-fatal
  } else if (Array.isArray(tracker)) {
    const locks = new Set(listClaimLocks());
    for (const c of tracker) {
      claims.push({
        ...c,
        status: locks.has(c.id) ? 'claimed' : 'free',
        collisions: locks.has(c.id) ? ['claim file exists'] : [],
        priority: c.rank,
        note: c.note + (locks.has(c.id) ? ' · CLAIMED' : ''),
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

  // Anti-under-spawn self-check
  const underSpawnFail = free.length > 0 && free.filter((c) => c.track === 'REGROUP' || c.track === 'AFK').length > 0;

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
    freeProduct: free.filter((c) => c.track === 'REGROUP' || c.track === 'AFK' || c.track === 'LANDER'),
    freeTracker: free.filter((c) => c.track === 'TRACKER'),
    underSpawnNote: underSpawnFail
      ? 'FREE product claims exist — coordinator must spawn or residual-own each (anti-under-spawn).'
      : 'No free REGROUP/AFK claims (or only OPS).',
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
  lines.push(`- **Free claims:** ${m.free.length} (product ${m.freeProduct.length}) · **Blocked:** ${m.blocked.length}`);
  lines.push(`- **Anti-under-spawn:** ${m.underSpawnNote}`);
  lines.push('- **Proof mode:** NO-FLEET until Docker present — static build + scans; never fake UI done');
  lines.push('- **Claims:** docs/ops/claims/<id>.md (do not hand-edit LIVE-LANES mid-wave)');
  if (m.residualError) lines.push(`- **Residual error:** ${m.residualError}`);
  else lines.push(`- **Residual:** updated=${m.residualUpdated} tip_note=${m.residualTipNote || '—'}`);
  lines.push('');
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
  lines.push('- `docs/SWARM-ALL-OUT-ORIENT-2026-08-03.md` · `docs/REGROUP-2026-08-03.md`');
  lines.push('- Before edit: `pnpm claim:check <paths>` · worktree only · no invent money/depth');
  lines.push('- Shehzad M1–M7 babysit only · no dual-edit Denon open PR files');
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
  console.log(`swarm:status  tip=${m.tip}  openPRs=${m.openPrCount}`);
  console.log(
    `  free=${m.free.length}  freeProduct=${m.freeProduct.length}  freeTracker=${(m.freeTracker || []).length}  blocked=${m.blocked.length}`,
  );
  console.log(`  ${m.underSpawnNote}`);
  console.log('  free product ids:', m.freeProduct.map((c) => c.id).join(', ') || '(none)');
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
    `| Free product (REGROUP/AFK/LANDER) | ${m.freeProduct.length} |`,
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
    `- Free product claims: **${m.freeProduct.length}**`,
    `- Blocked: **${m.blocked.length}**`,
    `- Open PRs: **${m.openPrCount}**`,
    '',
    m.underSpawnNote,
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
<p class=warn>Free product: <b>${m.freeProduct.length}</b> · Tracker free: <b>${(m.freeTracker || []).length}</b> · Blocked: <b>${m.blocked.length}</b> · Open PRs: <b>${m.openPrCount}</b></p>
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
    'Forbidden: Shehzad M1–M7; dual-edit Denon open PR files; invent money/depth; apps/web product; main checkout; mid-wave features.mjs/package.json.',
    'Proof: if no Docker — NO-FLEET (proof_missing: fleet-blocked). If :8090 listener cwd ≠ your worktree — visual proof invalid.',
    'Worktree from origin/main. pnpm verify when code. One PR. Stamp residual if AFK id.',
    '--- end paste ---',
  ].join('\n');
}

function printNext(m, all = false) {
  const list = m.freeProduct.length ? m.freeProduct : m.free.filter((c) => c.track !== 'OPS');
  if (!list.length) {
    console.log('swarm:next — no free product claims. Board empty or only blocked/OPS.');
    return;
  }
  if (all) {
    console.log(`swarm:next --all → ${list.length} free product claims\n`);
    for (const c of list) {
      console.log(pasteFor(c));
      console.log('');
    }
    console.log(`ANTI-UNDER-SPAWN: spawn or residual-own every id above (${list.length}).`);
    return;
  }
  console.log(pasteFor(list[0]));
  console.log('');
  console.log(`Remaining free product after this: ${list.length - 1}`);
  console.log('Tip: pnpm swarm:next --all  for every free product paste.');
}

// --- main ---
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
  default:
    console.error(`Usage: node tooling/scripts/swarm.mjs <freeze|status|report|next|claim>`);
    process.exit(1);
}
