#!/usr/bin/env node
/**
 * Remove the Chinese comments the translation pass left behind.
 *
 * These are not user-visible, but they are the first thing a developer sees on
 * opening a file, and a half-translated comment ("//signed in成功后将...") is
 * worse than none: it reads as damage rather than as a note.
 *
 * Deleting is the right call over translating. Every one of them restates what
 * the line below already says — `// 取消订单` above `cancelOrder()`. None
 * documents a decision, a constraint or a reason, so nothing is lost.
 *
 * Comments that still carry English content keep that content; only the
 * Chinese run is dropped. A comment that is *entirely* Chinese goes with its
 * line, so no bare `//` is left hanging.
 *
 * Run: node strip-comments.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '05_Web_Front/src');
const DRY = process.argv.includes('--dry');
const EXTS = new Set(['.vue', '.js']);
const SKIP = new Set(['node_modules', 'charting_library', '.git']);
const CJK = /[一-鿿]/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (EXTS.has(extname(path))) out.push(path);
  }
  return out;
}

let changed = 0;
let removedLines = 0;
let trimmed = 0;

for (const file of walk(ROOT)) {
  const before = readFileSync(file, 'utf8');
  const out = [];

  for (const line of before.split('\n')) {
    if (!CJK.test(line)) {
      out.push(line);
      continue;
    }

    // ── HTML comment: <!-- 中文 -->
    const html = line.match(/^(\s*)<!--([\s\S]*?)-->\s*$/);
    if (html && CJK.test(html[2])) {
      const rest = html[2].replace(/[一-鿿，。、：；！？（）《》【】]+/g, '').trim();
      if (rest) out.push(`${html[1]}<!-- ${rest} -->`);
      else removedLines++;
      trimmed++;
      continue;
    }

    // ── line comment: code // 中文   or   // 中文
    const idx = line.indexOf('//');
    if (idx !== -1 && CJK.test(line.slice(idx))) {
      const code = line.slice(0, idx);
      const comment = line.slice(idx + 2);
      // Never touch a `//` inside a string or URL — require the comment to be
      // preceded by nothing, whitespace, `;`, `,` or a closing bracket.
      if (/(^|[\s;,)\]}])$/.test(code)) {
        const rest = comment.replace(/[一-鿿，。、：；！？（）《》【】]+/g, '').replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '');
        if (code.trim() === '') {
          if (rest) out.push(`${code}// ${rest}`);
          else removedLines++;
        } else {
          out.push(rest ? `${code}// ${rest}` : code.replace(/\s+$/, ''));
        }
        trimmed++;
        continue;
      }
    }

    // ── block comment body line: * 中文
    const block = line.match(/^(\s*\*\s?)(.*)$/);
    if (block && CJK.test(block[2])) {
      const rest = block[2].replace(/[一-鿿，。、：；！？（）《》【】]+/g, '').trim();
      if (rest) out.push(`${block[1]}${rest}`);
      else removedLines++;
      trimmed++;
      continue;
    }

    out.push(line);
  }

  const after = out.join('\n');
  if (after !== before) {
    changed++;
    if (!DRY) writeFileSync(file, after, 'utf8');
  }
}

console.log(
  `${DRY ? '[dry run] ' : ''}${trimmed} comment(s) cleaned (${removedLines} line(s) removed) across ${changed} file(s)`,
);
