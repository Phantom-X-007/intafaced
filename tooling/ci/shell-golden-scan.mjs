#!/usr/bin/env node
/**
 * Shell desk golden tests — the honesty/math suites under 05_Web_Front.
 *
 * These files exist as `node …/*.golden.js` proofs (depth feedLive, ix-money,
 * book-honesty, hotkeys, …). Until this gate they only ran when an agent
 * remembered to. A golden that never executes is not a test.
 *
 * Exit 0 = every discovered golden exited 0. Exit 1 = any failed or none found.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const posix = (p) => p.replaceAll('\\', '/');
const ROOT = posix(fileURLToPath(new URL('../..', import.meta.url))).replace(/\/$/, '');
const SHELL = join(ROOT, 'vendor/upstream-exchange/05_Web_Front');
const GOLDEN_DIR = join(SHELL, 'src/assets/js');

function listGoldens(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith('.golden.js'))
    .map((name) => join(dir, name))
    .filter((p) => {
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

const goldens = listGoldens(GOLDEN_DIR);
if (goldens.length === 0) {
  console.error('✗ shell-golden-scan — no *.golden.js under', relative(ROOT, GOLDEN_DIR));
  process.exit(1);
}

let failed = 0;
for (const file of goldens) {
  const rel = relative(ROOT, file);
  const r = spawnSync(process.execPath, [file], {
    cwd: SHELL,
    encoding: 'utf8',
    env: process.env,
  });
  if (r.status === 0) {
    const last = (r.stdout || '').trim().split('\n').filter(Boolean).pop() || 'ok';
    console.log(`✓ ${rel} — ${last}`);
  } else {
    failed += 1;
    console.error(`✗ ${rel} exit=${r.status}`);
    if (r.stdout) process.stderr.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
  }
}

if (failed) {
  console.error(`✗ shell-golden-scan — ${failed}/${goldens.length} failed`);
  process.exit(1);
}
console.log(`✓ shell-golden-scan clean — ${goldens.length} golden(s)`);
process.exit(0);
