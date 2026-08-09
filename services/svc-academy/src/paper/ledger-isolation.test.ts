import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A PAPER DRILL POSTS NOTHING. Proven by reading the source, not by hoping.
 *
 * ── WHY A SOURCE SCAN AND NOT A SPY ─────────────────────────────────────────
 *
 * The honest answer to "does the paper path touch the ledger" today is that it
 * has no ledger client to touch — `AcademyService` is not constructed with one,
 * so a mock to assert zero calls against would be a mock of nothing, and it
 * would keep passing after somebody imported the client directly inside a paper
 * module. The test would be green for the wrong reason on exactly the day it
 * mattered.
 *
 * What actually needs guarding is the IMPORT. `services/svc-academy` depends on
 * `@intafaced/ledger-client` for real (`academy-service.ts` and `router.ts` use
 * the money math for stake thresholds), so the write surface is one autocomplete
 * away from any file in this directory. `ledger.post(recipes.tradeFill(...))`
 * inside `workbook-loop.ts` would compile, typecheck, format, and pass every
 * existing test in this service.
 *
 * ── THE LINE THIS DRAWS ─────────────────────────────────────────────────────
 *
 * Allowed: `parseAmount`, `formatAmount`, `mul`, `div`, `sub` — the money MATH.
 * There is one decimal implementation in this repo and a simulated figure must
 * use it, or "simulated" becomes an excuse for a float.
 *
 * Refused: the client, the recipes, and anything that assembles a posting. That
 * is what custody looks like, and doctrine §0.6 says a module that moves value
 * does it through the ledger — a drill moves none, so it needs none of it.
 *
 * If this test fails, the fix is never to widen ALLOWED. It is to take the post
 * back out, or to move the thing that genuinely needs to move value into the
 * service that is allowed to move it.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url));

/** The ledger's write surface, by the names it is actually reached through. */
const FORBIDDEN: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  { pattern: /\bLedgerClient\b/, why: 'the ledger client itself — a paper drill has nothing to post' },
  { pattern: /\bReadOnlyLedgerClient\b/, why: 'even the read client: a drill reads no real balance' },
  { pattern: /\brecipes\b/, why: 'a ledger recipe assembles a real double-entry posting' },
  { pattern: /\bmemory-ledger\b|\bMemoryLedger\b/, why: 'a second book, which §0.6 forbids outright' },
  { pattern: /\borderHold\b/, why: 'the exact recipe svc-trade’s paper migration says must never fire for paper' },
  { pattern: /\btradeFill\b/, why: 'the exact recipe svc-trade’s paper migration says must never fire for paper' },
  { pattern: /\bPostRequest\b|\bEntryInput\b/, why: 'the shape of a ledger posting' },
  { pattern: /\.post\s*\(/, why: 'a posting call' },
  { pattern: /\bAccountRef\b|\baccounts\.js\b/, why: 'ledger account addressing' },
];

/** The money math, which a simulated figure MUST use rather than re-implement. */
const ALLOWED_IMPORT = /^import \{ ([^}]*) \} from '@intafaced\/ledger-client';$/;
const ALLOWED_SYMBOLS = new Set(['div', 'formatAmount', 'mul', 'parseAmount', 'sub', 'add', 'type Amount', 'Amount']);

function paperSources(): { readonly name: string; readonly text: string }[] {
  return readdirSync(HERE)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((name) => ({ name, text: readFileSync(join(HERE, name), 'utf8') }));
}

/** Router + service code that implements the paper wire surface (not under src/paper/). */
function paperWireSurfaces(): { readonly name: string; readonly text: string }[] {
  const root = join(HERE, '..');
  const files = [
    { name: 'router.ts', path: join(root, 'router.ts') },
    { name: 'academy-service.ts', path: join(root, 'academy-service.ts') },
  ];
  return files.map(({ name, path }) => ({ name, text: readFileSync(path, 'utf8') }));
}

/** Extract only the paper-related procedure / method blocks from a larger file. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

function paperRelevantCode(name: string, text: string): string {
  // Locate regions on the RAW source (comment markers), then strip comments
  // so prose about the ledger does not trip the FORBIDDEN scan.
  if (name === 'router.ts') {
    const start = text.indexOf('paperDrill:');
    // Next major surface after paper ops is lobbies rooms:
    const end = text.indexOf('\n    rooms:');
    if (start < 0 || end < 0 || end <= start) {
      throw new Error('router.ts paper region markers not found — isolation scan cannot prove the wire path');
    }
    return stripComments(text.slice(start, end));
  }
  if (name === 'academy-service.ts') {
    const start = text.indexOf('assertPaperTradingEnabled');
    const end = text.indexOf('// ── Tournament ladders');
    if (start < 0) throw new Error('academy-service paper methods not found');
    return stripComments(text.slice(start, end > start ? end : undefined));
  }
  return stripComments(text);
}

describe('paper drills are structurally incapable of a real ledger post', () => {
  it('finds the paper modules at all — a scan over nothing proves nothing', () => {
    const names = paperSources().map((s) => s.name);
    expect(names).toContain('workbook-loop.ts');
    expect(names).toContain('simulated-result.ts');
    expect(names).toContain('ops-gate.ts');
  });

  it.each(paperSources())('$name imports no part of the ledger write surface', ({ name, text }) => {
    // Comments talk ABOUT the ledger on purpose — this whole directory is an
    // argument for why it stays out. Only code is scanned.
    const code = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');

    const hits = FORBIDDEN.filter(({ pattern }) => pattern.test(code)).map(({ pattern, why }) => `${pattern} — ${why}`);
    expect(hits, `${name} reaches the ledger write surface:\n  ${hits.join('\n  ')}`).toEqual([]);
  });

  it('imports from the ledger only the decimal math, and imports it by name', () => {
    for (const { name, text } of paperSources()) {
      for (const raw of text.split('\n')) {
        const line = raw.trim();
        // Only real import statements — this directory argues about the ledger
        // at length in prose, and prose is not a dependency.
        if (!line.startsWith('import ') || !line.includes('@intafaced/ledger-client')) continue;
        const match = ALLOWED_IMPORT.exec(line);
        expect(match, `${name}: ledger import must be a named import of the money math, got: ${line}`).not.toBeNull();
        const symbols = match![1]!.split(',').map((s) => s.trim());
        for (const symbol of symbols) {
          expect(ALLOWED_SYMBOLS.has(symbol), `${name} imports "${symbol}" from the ledger — only the decimal math is allowed here`).toBe(
            true,
          );
        }
      }
    }
  });

  it('never re-implements decimals with a float, which is the other way to lie about money', () => {
    for (const { name, text } of paperSources()) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '');
      // `parseFloat`/`Number.parseFloat` on a price is how a simulated book
      // starts disagreeing with itself at the 17th decimal place.
      expect(/parseFloat|Number\s*\(\s*(price|size|mark)/i.test(code), `${name} parses money with a float`).toBe(false);
    }
  });
});

describe('paper wire path (router + service) cannot post to the ledger', () => {
  it('finds the paper regions on the router and service', () => {
    const surfaces = paperWireSurfaces();
    expect(surfaces.map((s) => s.name).sort()).toEqual(['academy-service.ts', 'router.ts']);
  });

  it.each(paperWireSurfaces())('$name paper region imports no ledger write surface', ({ name, text }) => {
    const code = paperRelevantCode(name, text);
    expect(code.length).toBeGreaterThan(50);
    const hits = FORBIDDEN.filter(({ pattern }) => pattern.test(code)).map(({ pattern, why }) => `${pattern} — ${why}`);
    expect(hits, `${name} paper wire reaches ledger write surface:\n  ${hits.join('\n  ')}`).toEqual([]);
  });
});
