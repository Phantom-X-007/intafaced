#!/usr/bin/env node
/** Print residual register as a table (priority order).
 *  Usage: node residual-print.mjs [open|partial|blocked|done|afk]
 *  afk = open|partial with afk_safe!==false only (default AFK campaign view).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const reg = JSON.parse(readFileSync(join(ROOT, 'tooling/frontend/residual-register.json'), 'utf8'));
const items = [...(reg.items || [])].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

const want = process.argv[2]; // optional filter

console.log(
  `residual-register  updated=${reg.updated}  items=${items.length}` +
    (reg.tip_note ? `  tip_note=${reg.tip_note}` : '') +
    (reg.campaign ? `  campaign=${reg.campaign.id}` : '') +
    '\n',
);
console.log(
  ['P', 'ID', 'AFK', 'ST', 'TITLE', 'NEXT'].map((h) => h.padEnd(h === 'TITLE' ? 40 : h === 'NEXT' ? 36 : h === 'ID' ? 16 : 6)).join(' '),
);
for (const i of items) {
  const afk = i.afk_safe === false ? 'no' : 'yes';
  if (want === 'afk') {
    if (i.afk_safe === false) continue;
    if (i.status === 'done' || i.status === 'waived') continue;
    if ((i.priority ?? 99) >= 90) continue;
  } else if (want) {
    if (i.status !== want) continue;
  } else {
    if (i.status === 'done' || i.priority >= 90) continue; // default: actionable
  }
  const row = [
    String(i.priority ?? '').padEnd(6),
    (i.id || '').padEnd(16),
    afk.padEnd(6),
    (i.status || '').padEnd(8),
    (i.title || '').slice(0, 38).padEnd(40),
    (i.next_action || i.blocker || '').slice(0, 36),
  ];
  console.log(row.join(' '));
}
if (want === 'afk' || (reg.tip_note && String(reg.tip_note).includes('AFK-ACTIVE'))) {
  console.log('\nAFK: pick lowest P with AFK=yes and ST open|partial. Never stall on AFK=no.');
}
