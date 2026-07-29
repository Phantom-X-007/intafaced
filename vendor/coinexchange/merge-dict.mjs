#!/usr/bin/env node
/**
 * Merge a batch of translations into zh-en.json.
 *
 * The dictionary is the shared asset — extended, never replaced. This keeps the
 * merge honest: an incoming key that already exists with a *different* value is
 * reported rather than silently overwritten, because a term that means two
 * things in two screens is a decision, not a merge conflict to resolve blindly.
 *
 * Run: node merge-dict.mjs additions.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DICT = join(HERE, 'zh-en.json');

const dict = JSON.parse(readFileSync(DICT, 'utf8'));
const additions = JSON.parse(readFileSync(process.argv[2], 'utf8'));

let added = 0;
const conflicts = [];
for (const [zh, en] of Object.entries(additions)) {
  if (dict[zh] === undefined) {
    dict[zh] = en;
    added++;
  } else if (dict[zh] !== en) {
    conflicts.push(`${zh}: kept "${dict[zh]}", ignored "${en}"`);
  }
}

writeFileSync(DICT, `${JSON.stringify(dict, null, 2)}\n`, 'utf8');
console.log(`+${added} entr(ies) — dictionary now ${Object.keys(dict).filter((k) => !k.startsWith('_')).length}`);
for (const c of conflicts) console.log(`  ! ${c}`);
