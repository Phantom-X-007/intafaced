#!/usr/bin/env node
/** Print residual register as a table (priority order). */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const reg = JSON.parse(readFileSync(join(ROOT, 'tooling/frontend/residual-register.json'), 'utf8'));
const items = [...(reg.items || [])].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

const want = process.argv[2]; // optional filter: open|partial|blocked|done

console.log(`residual-register  updated=${reg.updated}  items=${items.length}\n`);
console.log(['P', 'ID', 'ST', 'TITLE', 'NEXT'].map((h) => h.padEnd(h === 'TITLE' ? 42 : h === 'NEXT' ? 40 : 8)).join(' '));
for (const i of items) {
  if (want && i.status !== want) continue;
  if (!want && (i.status === 'done' || i.priority >= 90)) continue; // default: actionable
  const row = [
    String(i.priority ?? '').padEnd(8),
    (i.id || '').padEnd(8),
    (i.status || '').padEnd(8),
    (i.title || '').slice(0, 40).padEnd(42),
    (i.next_action || i.blocker || '').slice(0, 40),
  ];
  console.log(row.join(' '));
}
