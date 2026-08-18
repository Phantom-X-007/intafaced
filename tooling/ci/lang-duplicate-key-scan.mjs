#!/usr/bin/env node
/**
 * DUPLICATE KEY SCAN — the shell language files, checked for keys that silently
 * eat each other.
 *
 * WHAT THIS IS ABOUT. `en.js` is one object literal with ~2,200 keys. In a JS
 * object literal a repeated key is not an error and not a warning: the later
 * declaration simply wins, and the earlier one — along with every key only it
 * defined — is gone. Nothing in the toolchain says a word.
 *
 * That is not hypothetical. `intafaced.socket` was declared twice. The first
 * block defined exactly one key, `needs`; the second defined eight others and,
 * being later, replaced the block wholesale. `intafaced.socket.needs` therefore
 * evaluated to `undefined`, and `IxSocketPage.vue` — which asks for precisely
 * that key — would render the raw string `intafaced.socket.needs` to a user.
 *
 * WHY A GATE AND NOT JUST THE FIX. The fix is three lines. The failure mode is
 * what needs stopping: this file is edited constantly, by several agents at
 * once, and it is long enough that nobody scrolls it. Two people adding a
 * `socket:` block months apart is not carelessness, it is the predictable
 * result of a 2,200-key literal with no uniqueness check. A missing translation
 * is meant to be impossible to ship unnoticed (see `packages/i18n`, whose entire
 * premise is that a missing key is a COMPILE error); the vendored shell has no
 * such type, so it gets this instead.
 *
 * WHAT IT DOES NOT DO. It does not check that a key is USED, or that a used key
 * EXISTS — those are different scans with different false-positive profiles.
 * This one answers a single question with no judgement in it: does any key
 * appear twice at the same path?
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const posix = (p) => p.replaceAll('\\', '/');
const ROOT = posix(fileURLToPath(new URL('../..', import.meta.url))).replace(/\/$/, '');

/** Every language file in the vendored shell. English is the only one today. */
const FILES = ['vendor/upstream-exchange/05_Web_Front/src/assets/lang/en.js'];

/**
 * Walk the object literal by nesting depth and collect every declared key path.
 *
 * A parser would be more rigorous, but the input is a hand-maintained literal of
 * plain string values — no computed keys, no spreads — so line shape is enough,
 * and a scan nobody can read is a scan nobody maintains.
 */
function duplicateKeys(source) {
  const lines = source.split(/\r?\n/);
  const path = [];
  const seen = new Map();
  const dups = [];

  const record = (name, lineNo) => {
    const key = [...path, name].join('.');
    if (seen.has(key)) dups.push({ key, first: seen.get(key), again: lineNo });
    else seen.set(key, lineNo);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const open = line.match(/^\s*([A-Za-z_$][\w$]*)\s*:\s*\{/);
    if (open) {
      record(open[1], i + 1);
      path.push(open[1]);
      // `a: { b: 1 },` opens and closes on one line — pop what it closed.
      const o = (line.match(/\{/g) || []).length;
      const c = (line.match(/\}/g) || []).length;
      for (let k = 0; k < c - (o - 1) && path.length; k++) path.pop();
      continue;
    }

    const leaf = line.match(/^\s*([A-Za-z_$][\w$]*)\s*:\s*["'`]/);
    if (leaf) {
      record(leaf[1], i + 1);
      continue;
    }

    const o = (line.match(/\{/g) || []).length;
    const c = (line.match(/\}/g) || []).length;
    for (let k = 0; k < c - o && path.length; k++) path.pop();
  }

  return { dups, count: seen.size };
}

let failed = false;
for (const rel of FILES) {
  const { dups, count } = duplicateKeys(readFileSync(`${ROOT}/${rel}`, 'utf8'));
  if (dups.length === 0) {
    console.log(`✓ lang-duplicate-key-scan clean — ${rel}, ${count} key(s), no duplicates`);
    continue;
  }
  failed = true;
  console.error(`\n✗ ${rel} — ${dups.length} duplicate key(s). The LATER one wins and the earlier block is discarded:\n`);
  for (const d of dups) {
    console.error(`    ${d.key}`);
    console.error(`      declared at line ${d.first}, declared again at line ${d.again}`);
  }
  console.error(
    `\n  Merge the blocks. Every key the earlier one defined and the later one does not\n` +
      `  is currently resolving to undefined, and renders to a user as its own raw key.\n`,
  );
}

process.exit(failed ? 1 : 0);
