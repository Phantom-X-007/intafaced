#!/usr/bin/env node
/**
 * Dual-book door-kill registration scan (Plan P2-4 · Spec DB-2 · Architect A1).
 *
 * Proves the Spring money-door interceptor exists and is registered on the four
 * money-facing ApplicationConfig modules (admin, ucenter-api, otc-api, exchange-api).
 *
 * Does not prove a running JVM — that is residual until a Spring boot smoke exists.
 * Combined with DAO no-ops + service throws + vendor-java-money-scan, this is the
 * "at the door" wiring check CI can enforce without Java runtime.
 *
 * Exit 0 = wired. Exit 1 = missing class or registration.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const VENDOR = join(ROOT, 'vendor');

if (!statSync(VENDOR, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('✖ dual-book-door-scan: vendor/ tree missing — dual-book door cannot be verified');
  process.exit(1);
}

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

const interceptorFiles = walk(VENDOR, (name) => name === 'DualBookMoneyDoorInterceptor.java');
if (interceptorFiles.length !== 1) {
  console.error(`✖ dual-book-door-scan: expected exactly one DualBookMoneyDoorInterceptor.java, found ${interceptorFiles.length}`);
  process.exit(1);
}

const interceptorSrc = readFileSync(interceptorFiles[0], 'utf8');
if (!/SC_GONE|410/.test(interceptorSrc)) {
  console.error('✖ dual-book-door-scan: interceptor must refuse with HTTP 410 Gone');
  process.exit(1);
}
if (!/BLOCKED_URI_FRAGMENTS|member-wallet\/recharge|withdraw\/apply/.test(interceptorSrc)) {
  console.error('✖ dual-book-door-scan: interceptor missing inventory-driven blocked path fragments');
  process.exit(1);
}

/** Apps that host money controllers per P2-1 inventory. */
const REQUIRED_CONFIG_MARKERS = [
  { id: 'admin', pathIncludes: ['admin', 'ApplicationConfig.java'] },
  { id: 'ucenter-api', pathIncludes: ['ucenter-api', 'ApplicationConfig.java'] },
  { id: 'otc-api', pathIncludes: ['otc-api', 'ApplicationConfig.java'] },
  { id: 'exchange-api', pathIncludes: ['exchange-api', 'ApplicationConfig.java'] },
];

const appConfigs = walk(VENDOR, (name, p) => name === 'ApplicationConfig.java');
const failures = [];

for (const marker of REQUIRED_CONFIG_MARKERS) {
  const match = appConfigs.find((p) => marker.pathIncludes.every((seg) => p.includes(seg)));
  if (!match) {
    failures.push(`no ApplicationConfig.java found for ${marker.id}`);
    continue;
  }
  const text = readFileSync(match, 'utf8');
  if (!text.includes('DualBookMoneyDoorInterceptor')) {
    failures.push(`${relative(ROOT, match)} does not register DualBookMoneyDoorInterceptor`);
  }
}

if (failures.length) {
  console.error('✖ dual-book-door-scan failed — door-kill not wired:\n');
  for (const f of failures) console.error(`  · ${f}`);
  console.error('');
  process.exit(1);
}

console.log(`✓ dual-book-door-scan clean — interceptor + registration on ${REQUIRED_CONFIG_MARKERS.map((m) => m.id).join(', ')}`);
