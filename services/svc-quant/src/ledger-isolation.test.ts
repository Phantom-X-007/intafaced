import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Paper / backtest / shadow paths cannot call ledger.post.
 * Proven by reading source — a spy on a client this service does not hold
 * would stay green after someone imported the client inside the paper book.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url));

const FORBIDDEN: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  { pattern: /\bLedgerClient\b/, why: 'the ledger client — paper/shadow posts nothing' },
  { pattern: /\bReadOnlyLedgerClient\b/, why: 'even the read client: this book holds no live balance' },
  { pattern: /\brecipes\b/, why: 'a ledger recipe assembles a real posting' },
  { pattern: /\bMemoryLedger\b|\bmemory-ledger\b/, why: 'a second money book' },
  { pattern: /\bledger\.post\b/, why: 'the write surface' },
  { pattern: /\.post\s*\(/, why: 'a posting call' },
];

const ALLOWED_IMPORT = /^import \{ ([^}]*) \} from '@intafaced\/ledger-client(?:\/money)?';$/;
const ALLOWED_SYMBOLS = new Set(['add', 'div', 'formatAmount', 'mul', 'parseAmount', 'sub', 'type Amount', 'Amount']);

function walkTs(dir: string): { readonly name: string; readonly text: string }[] {
  const out: { name: string; text: string }[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      out.push(...walkTs(path));
      continue;
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
    out.push({ name: path.slice(HERE.length), text: readFileSync(path, 'utf8') });
  }
  return out;
}

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

describe('paper/backtest/shadow never post to the ledger', () => {
  const sources = walkTs(HERE);

  it('scans every non-test source in svc-quant', () => {
    const names = sources.map((s) => s.name.replace(/\\/g, '/'));
    for (const required of [
      'sandbox/book.ts',
      'sandbox/run.ts',
      'backtest/run.ts',
      'studio/save.ts',
      'marketplace/claim.ts',
      'honesty.ts',
      'router.ts',
    ]) {
      expect(names.some((name) => name.endsWith(required))).toBe(true);
    }
  });

  it('forbids ledger.post and the client on paper/shadow/backtest paths', () => {
    for (const { name, text } of sources) {
      const body = stripComments(text);
      for (const { pattern, why } of FORBIDDEN) {
        expect(body, `${name} — ${why}`).not.toMatch(pattern);
      }
    }
  });

  it('allows only money math from ledger-client', () => {
    for (const { name, text } of sources) {
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('import ') || !trimmed.includes('@intafaced/ledger-client')) continue;
        const match = ALLOWED_IMPORT.exec(trimmed);
        expect(match, `${name}: unexpected ledger-client import ${trimmed}`).not.toBeNull();
        const imported = match?.[1] ?? '';
        expect(imported.length).toBeGreaterThan(0);
        const symbols = imported
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        for (const symbol of symbols) {
          expect(ALLOWED_SYMBOLS.has(symbol), `${name}: ${symbol} is not money math`).toBe(true);
        }
      }
    }
  });
});
