#!/usr/bin/env node
/**
 * Dual-book door path-matcher unit (no JVM).
 *
 * Parses DualBookMoneyDoorInterceptor.java BLOCKED_URI_FRAGMENTS and asserts:
 *   1. Known money-controller URIs are refused (substring match, case-insensitive)
 *   2. Benign URIs are allowed
 *   3. Fragment count stays above inventory floor (regression guard)
 *
 * Complements scan:dual-book-door (wiring) without requiring Spring boot.
 * Spec DB-2 acceptance residual: full JVM 410 smoke still needs a running Java
 * process (H-OR-JAVA / ops) — this proves the **path table logic** stays intact.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const VENDOR = join(ROOT, 'vendor');

function walk(dir, pred, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'target' || name === '.git') continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, pred, out);
    else if (pred(name, p)) out.push(p);
  }
  return out;
}

const files = walk(VENDOR, (n) => n === 'DualBookMoneyDoorInterceptor.java');
if (files.length !== 1) {
  console.error(`✖ dual-book-door-path-unit: expected 1 interceptor, found ${files.length}`);
  process.exit(1);
}

const src = readFileSync(files[0], 'utf8');
const block = src.match(/BLOCKED_URI_FRAGMENTS\s*=\s*Arrays\.asList\(([\s\S]*?)\);/);
if (!block) {
  console.error('✖ dual-book-door-path-unit: could not parse BLOCKED_URI_FRAGMENTS');
  process.exit(1);
}

const fragments = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
if (fragments.length < 25) {
  console.error(`✖ dual-book-door-path-unit: fragment floor 25 not met (found ${fragments.length}) — Spec DB-2 inventory class`);
  process.exit(1);
}

function wouldBlock(uri) {
  const path = uri.toLowerCase();
  return fragments.some((f) => path.includes(f.toLowerCase()));
}

const mustBlock = [
  '/admin/member/member-wallet/recharge',
  '/uc/legal-wallet-recharge/apply',
  '/uc/withdraw/apply',
  '/otc/order/buy',
  '/exchange/order/add',
  '/admin/finance/withdraw-record/audit-pass',
  '/uc/redenvelope/receive',
  '/admin/system/dividend/start',
];

const mustAllow = ['/uc/member/login', '/market/symbol-thumb', '/health', '/actuator/health', '/uc/asset/wallet'];

const fails = [];
for (const u of mustBlock) {
  if (!wouldBlock(u)) fails.push(`should block ${u}`);
}
for (const u of mustAllow) {
  if (wouldBlock(u)) fails.push(`should allow ${u}`);
}

if (fails.length) {
  console.error('✖ dual-book-door-path-unit failed:\n' + fails.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log(
  `✓ dual-book-door-path-unit clean — ${fragments.length} fragments, ${mustBlock.length} block + ${mustAllow.length} allow fixtures`,
);
