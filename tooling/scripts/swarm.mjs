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
 *   pnpm swarm:next     → first free claim + worker paste pack
 *
 * Exit 0 always when the tool answered honestly (including "0 free").
 * Exit 2 when gh/git cannot answer (same spirit as claim-check).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OPS = join(ROOT, 'docs', 'ops');
const cmd = process.argv[2] || 'status';

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
      'vendor/coinexchange/05_Web_Front/src/pages/exchange/Exchange.vue',
      'vendor/coinexchange/05_Web_Front/src/assets/js/ix-money.js',
      'vendor/coinexchange/05_Web_Front/src/assets/js/book-honesty.js',
      'vendor/coinexchange/05_Web_Front/src/assets/js/ix-trade.js',
    ],
    note: 'Branch origin/fix/shell-money-on-the-wire may already have module — finish call sites',
  },
  {
    id: 'RP2',
    rank: 20,
    track: 'REGROUP',
    title: 'Index.vue landing honesty (null / green ▲ / PRICE TREND)',
    paths: [
      'vendor/coinexchange/05_Web_Front/src/pages/index/Index.vue',
      'vendor/coinexchange/05_Web_Front/src/assets/lang/en.js',
      'vendor/coinexchange/05_Web_Front/src/assets/js/ix-trade.js',
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
      'vendor/coinexchange/05_Web_Front/src/assets/js/sockets.js',
      'vendor/coinexchange/05_Web_Front/src/components/IxNoSurface.vue',
      'vendor/coinexchange/05_Web_Front/src/pages/index/Index.vue',
    ],
    note: 'May share Index paths with RP2 — check freeze',
  },
  {
    id: 'RP4',
    rank: 40,
    track: 'REGROUP',
    title: 'ix-wire golden + adopt schemas on ix-trade reads',
    paths: ['vendor/coinexchange/05_Web_Front/src/assets/js/ix-wire.js', 'vendor/coinexchange/05_Web_Front/src/assets/js/ix-trade.js'],
    note: 'Branch origin/fix/shell-wire-validation may have schemas',
  },
  {
    id: 'RP-LAND-MONEY',
    rank: 15,
    track: 'LANDER',
    title: 'Open/finish PR from origin/fix/shell-money-on-the-wire',
    paths: ['vendor/coinexchange/05_Web_Front/src/assets/js/ix-money.js', 'vendor/coinexchange/05_Web_Front/src/assets/js/book-honesty.js'],
    note: 'Prefer land branch; do not rewrite from zero',
  },
  {
    id: 'RP-LAND-LANDING',
    rank: 25,
    track: 'LANDER',
    title: 'Open/finish PR from origin/fix/shell-landing-honesty',
    paths: ['vendor/coinexchange/05_Web_Front/src/assets/lang/en.js'],
    note: 'Strings only until RP2 wires Index',
  },
  {
    id: 'RP-LAND-WIRE',
    rank: 35,
    track: 'LANDER',
    title: 'Open/finish PR from origin/fix/shell-wire-validation',
    paths: ['vendor/coinexchange/05_Web_Front/src/assets/js/ix-wire.js'],
    note: 'Schemas exist; golden + adopt is RP4',
  },
  {
    id: 'P-WS-REPORT',
    rank: 5,
    track: 'INTEGRITY',
    title: 'WS market-ID + /ws→/stream integrity report (no depth UI)',
    paths: ['services/svc-ws', 'services/svc-matching', 'services/svc-edge', 'vendor/coinexchange/05_Web_Front/nginx.conf'],
    note: 'Report/handoff first; implement only if path-clear vs Denon open PRs',
  },
];

/** Default path prefixes for residual ids when register has no paths field */
const RESIDUAL_PATH_HINTS = {
  'AFK-UC-COMP': ['vendor/coinexchange/05_Web_Front/src/components/uc'],
  'AFK-IDENT': ['vendor/coinexchange/05_Web_Front/src/pages/uc/IdentBusiness.vue'],
  'AFK-LAB-PASS': ['vendor/coinexchange/05_Web_Front/src/pages/intafaced'],
  'AFK-INDEX': ['vendor/coinexchange/05_Web_Front/src/pages/index/Index.vue'],
  'AFK-CMDK-ROUTES': ['vendor/coinexchange/05_Web_Front/src/assets/js/cmd-palette.js'],
  'AFK-HELP-DETAIL': ['vendor/coinexchange/05_Web_Front/src/pages/cms/HelpDetail.vue'],
  'AFK-WHITEPAPER': ['vendor/coinexchange/05_Web_Front/src/pages/cms/WhitePaper.vue'],
  'AFK-APPDOWNLOAD': ['vendor/coinexchange/05_Web_Front/src/pages/cms/AppDownload.vue'],
  'AFK-FOOTER': ['vendor/coinexchange/05_Web_Front/src/App.vue'],
  'AFK-RESCAN': ['vendor/coinexchange/05_Web_Front'],
  B12: ['vendor/coinexchange/05_Web_Front/src/pages'],
  B13: ['vendor/coinexchange/05_Web_Front'],
  'META-STEAL': ['docs/refs'],
  'META-CRITIQUE': ['docs/refs'],
  'META-ORCA': [],
  'P0.4': ['tooling/uiproof'],
};

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
    const paths = RESIDUAL_PATH_HINTS[i.id] || ['vendor/coinexchange/05_Web_Front'];
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
  console.log(`  free=${m.free.length}  freeProduct=${m.freeProduct.length}  blocked=${m.blocked.length}`);
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
  return OPS;
}

function printNext(m) {
  const next = m.freeProduct[0] || m.free.find((c) => c.track === 'INTEGRITY') || m.free.find((c) => c.track === 'OPS') || m.free[0];
  if (!next) {
    console.log('swarm:next — no free claims. Board empty or only blocked.');
    console.log('Re-run: pnpm swarm:freeze && pnpm swarm:status');
    return;
  }
  const paths = (next.paths || []).join('\n  ') || '(none — research/ops)';
  console.log(`swarm:next → ${next.id} [${next.track}]`);
  console.log(`  ${next.title}`);
  console.log('');
  console.log('--- worker paste ---');
  console.log(`PRE-FLIGHT: pnpm swarm:freeze · pnpm claim:check · docs/SWARM-ALL-OUT-ORIENT-2026-08-03.md`);
  console.log(`You own ONLY claim: ${next.id}`);
  console.log(`Scope: ${next.title}`);
  console.log(`Allowed paths:\n  ${paths}`);
  console.log(`Note: ${next.note || '—'}`);
  console.log(`Forbidden: Shehzad M1–M7 implement; dual-edit Denon open PR files; invent money/depth; apps/web product; main checkout.`);
  console.log(`Worktree from origin/main. Claim LIVE-LANES. pnpm verify when code. One PR. Stamp residual if AFK id.`);
  console.log('--- end paste ---');
  console.log('');
  console.log(`Remaining free product after this: ${Math.max(0, m.freeProduct.length - (m.freeProduct[0] === next ? 1 : 0))}`);
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
    // prefer fresh freeze if missing; still recompute
    writeFreeze(m);
    printNext(m);
    break;
  }
  default:
    console.error(`Usage: node tooling/scripts/swarm.mjs <freeze|status|report|next>`);
    process.exit(1);
}
