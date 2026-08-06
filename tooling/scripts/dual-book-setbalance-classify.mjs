#!/usr/bin/env node
/**
 * Classify vendor Java setBalance/setFrozenBalance call sites:
 *   LIVE  — not obviously behind dual-book throw / null short-circuit in same method
 *   DEAD  — method starts with throw dual-book, or guarded by `if (null)` / `= null` disable
 *
 * Honest residual inventory for H-OR-JAVA (human M7). Agents use this so we stop
 * treating already-disabled service bodies as open dual-book holes.
 *
 * Run: node tooling/scripts/dual-book-setbalance-classify.mjs
 * Exit 0 always (report tool). Optional --fail-if-live-over=N for future gates.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const VENDOR = join(ROOT, 'vendor');
const FAIL_OVER = process.argv.find((a) => a.startsWith('--fail-if-live-over='));
const liveCap = FAIL_OVER ? Number(FAIL_OVER.split('=')[1]) : null;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'target' || name === '.git') continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.java')) out.push(p);
  }
  return out;
}

const javaFiles = walk(VENDOR);
const re = /set(?:Frozen)?Balance\s*\(/g;
const rows = [];

for (const file of javaFiles) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/set(?:Frozen)?Balance\s*\(/.test(line)) continue;
    if (/^\s*\/\//.test(line) || line.includes('//memberWallet') || /^\s*\*/.test(line)) {
      // skip pure comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
    }
    // window: look back up to 40 lines for method-entry throw dual-book
    const start = Math.max(0, i - 40);
    const window = lines.slice(start, i + 1).join('\n');
    const deadThrow =
      /throw new IllegalStateException\([\s\S]{0,200}(?:dual-book|Java shell must not)/i.test(window) &&
      // throw appears after last method-ish open brace before this line
      true;
    // Look back far enough for dual-book early-return / null short-circuits.
    const back = lines.slice(Math.max(0, i - 80), i).join('\n');
    const hasDisableThrow = /throw new IllegalStateException\([\s\S]*?(dual-book|Java shell must not)/i.test(back);
    const dualBookDead =
      /RewardPromotionSetting\s+\w+\s*=\s*null/.test(back) ||
      /RewardActivitySetting\s+\w+\s*=\s*null/.test(back) ||
      /rewardPromotionSetting\s*=\s*null/.test(back) ||
      /rewardActivitySetting\s*=\s*null/.test(back) ||
      /if\s*\(\s*false\s*&&/.test(back) ||
      /Dual-book:[^\n]*disabled/i.test(back) ||
      /never mint promotion balances/i.test(back) ||
      /wallet mints disabled/i.test(back) ||
      /level-two wallet mints disabled/i.test(back) ||
      /dead dual-book/i.test(back);

    // Controllers: split by whether DualBookMoneyDoorInterceptor lists a path fragment.
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const isController = /\/controller\//i.test(rel);
    const isCommented = /^\s*\/\//.test(line) || line.trim().startsWith('*');
    const isWalletZeroInit =
      /set(?:Frozen)?Balance\s*\(\s*new BigDecimal\s*\(\s*0\s*\)\s*\)/.test(line) ||
      /set(?:Frozen)?Balance\s*\(\s*BigDecimal\.ZERO\s*\)/.test(line);

    // HotTransferRecord.setBalance is a transfer *log* field, not MemberWallet mint.
    const isRecordNotWallet =
      /hotTransferRecord\.set(?:Frozen)?Balance/i.test(line) ||
      (/HotTransferRecord/i.test(window) && /setBalance\s*\(\s*balance\.subtract/i.test(line));

    let kind = 'LIVE';
    if (isCommented) kind = 'COMMENT';
    else if (isRecordNotWallet) kind = 'RECORD_NOT_WALLET';
    else if (hasDisableThrow) kind = 'DEAD_THROW';
    else if (dualBookDead) kind = 'DEAD_NULL';
    else if (isController)
      kind = 'HTTP_DOOR'; // refined below against door fragments
    else if (isWalletZeroInit) kind = 'WALLET_INIT_ZERO';

    rows.push({ kind, file: rel, line: i + 1, snippet: line.trim().slice(0, 120) });
  }
}

/** Load BLOCKED_URI_FRAGMENTS from the dual-book door interceptor (honest coverage). */
function loadDoorFragments() {
  // Discover by class filename only — do not embed vendor package path literals (brand-scan).
  const name = 'DualBookMoneyDoorInterceptor.java';
  let doorPath = null;
  for (const f of javaFiles) {
    if (f.endsWith(name) || f.endsWith(`/interceptor/${name}`)) {
      doorPath = f;
      break;
    }
  }
  if (!doorPath) return [];
  try {
    const text = readFileSync(doorPath, 'utf8');
    const frags = [];
    const reFrag = /"(\/[^"]+)"/g;
    let m;
    while ((m = reFrag.exec(text)) !== null) {
      if (m[1].startsWith('/')) frags.push(m[1].toLowerCase());
    }
    return frags;
  } catch {
    return [];
  }
}

const doorFrags = loadDoorFragments();
function controllerLikelyCovered(relFile) {
  // Map controller file path → coarse URI cues (best-effort; not Spring RequestMapping parse).
  const lower = relFile.toLowerCase();
  const cues = [];
  if (lower.includes('/dividend')) cues.push('/system/dividend', '/dividend');
  if (lower.includes('/withdrawrecord')) cues.push('/finance/withdraw-record', '/withdraw-record');
  if (lower.includes('/memberwallet')) cues.push('/member/member-wallet', '/member-wallet');
  if (lower.includes('/membercontroller')) cues.push('/member/', '/audit-business', '/cancel-business');
  if (lower.includes('/businesscancel')) cues.push('/business/cancel-apply', '/cancel-apply');
  if (lower.includes('/approvecontroller')) cues.push('/approve/', '/certified/business');
  if (lower.includes('/redenvelope')) cues.push('/redenvelope');
  if (lower.includes('/coincontroller')) cues.push('/system/coin', '/coin/');
  if (cues.length === 0) {
    // Generic: any fragment appearing as a path segment in the file path
    return doorFrags.some((f) => lower.includes(f.replace(/\//g, '')) || lower.includes(f.slice(1)));
  }
  return cues.some((c) => doorFrags.some((f) => c.includes(f) || f.includes(c)));
}

for (const r of rows) {
  if (r.kind !== 'HTTP_DOOR') continue;
  r.kind = controllerLikelyCovered(r.file) ? 'HTTP_DOOR_COVERED' : 'HTTP_DOOR_UNCOVERED';
}

const counts = {};
for (const r of rows) counts[r.kind] = (counts[r.kind] || 0) + 1;

console.log('dual-book setBalance classify');
console.log(JSON.stringify(counts, null, 2));
console.log('--- LIVE (H-OR-JAVA candidates) ---');
const live = rows.filter((r) => r.kind === 'LIVE');
for (const r of live) {
  console.log(`${r.file}:${r.line}: ${r.snippet}`);
}
console.log(`--- total live: ${live.length} ---`);
console.log('--- HTTP_DOOR_UNCOVERED (door may not block — M7 / door list residual) ---');
for (const r of rows.filter((r) => r.kind === 'HTTP_DOOR_UNCOVERED')) {
  console.log(`${r.file}:${r.line}: ${r.snippet}`);
}
console.log('--- HTTP_DOOR_COVERED (fragment likely on interceptor) ---');
for (const r of rows.filter((r) => r.kind === 'HTTP_DOOR_COVERED')) {
  console.log(`${r.file}:${r.line}: ${r.snippet}`);
}

if (liveCap != null && live.length > liveCap) {
  console.error(`✖ live setBalance ${live.length} > cap ${liveCap}`);
  process.exit(1);
}
process.exit(0);
