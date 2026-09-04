import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * H8 companion — dual-book scan for `packages/ledger-client`.
 *
 * This package is the only money-write library: recipes + MemoryLedger + the
 * HTTP/client interface. A second book here is extra in-memory balances, a
 * parallel recipe book, Java wallet mutators, or SQL/drizzle tables.
 *
 * MemoryLedger's `balancesByAccountId` is the one in-process book. Do not recut
 * it. Do not add a second money type.
 *
 * Walks this package only — never svc-ledger, never vendor.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, '..');

/** Client library has no SQL book. Any CREATE TABLE / drizzle table is extra. */
const ONE_BOOK_TABLES = new Set<string>();

const JAVA_WALLET_IDS: readonly { readonly id: string; readonly re: RegExp; readonly why: string }[] = [
  { id: 'member_wallet', re: /\bmember_wallet\b/i, why: 'Java member_wallet table' },
  { id: 'MemberWallet', re: /\bMemberWallet(?:Dao|Service)?\b/, why: 'Java MemberWallet entity' },
  { id: 'increaseBalance', re: /\bincreaseBalance\s*\(/, why: 'Java wallet mutator' },
  { id: 'decreaseBalance', re: /\bdecreaseBalance\s*\(/, why: 'Java wallet mutator' },
  { id: 'freezeBalance', re: /\bfreezeBalance\s*\(/, why: 'Java wallet mutator' },
  { id: 'thawBalance', re: /\bthawBalance\s*\(/, why: 'Java wallet mutator' },
  { id: 'legal_wallet', re: /\blegal_wallet\b/i, why: 'Java legal-wallet table' },
  { id: 'heldBalances', re: /\bheldBalances\b/, why: 'service-held balance map' },
  { id: 'serviceHeldBalance', re: /\bserviceHeldBalance/, why: 'service-held balance' },
];

const CREATE_TABLE =
  /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:(?:"([^"]+)"|([A-Za-z_][\w]*))\s*\.\s*)?(?:"([^"]+)"|([A-Za-z_][\w]*))/gi;

const DRIZZLE_TABLE = /\.table\(\s*['"]([^'"]+)['"]/g;
const PG_TABLE = /\bpgTable\(\s*['"]([^'"]+)['"]/g;
const PG_SCHEMA = /\bpgSchema\(\s*['"]([^'"]+)['"]/g;
const CREATE_SCHEMA = /CREATE\s+SCHEMA(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:"([^"]+)"|([A-Za-z_][\w]*))/gi;

export type DualBookHit = {
  readonly id: string;
  readonly why: string;
  readonly excerpt: string;
};

function stripSqlComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function stripTsCommentsKeepStrings(source: string): string {
  const literals: string[] = [];
  const masked = source.replace(/(['"`])(?:\\.|[^\\])*?\1/g, (s) => {
    literals.push(s);
    return `"\u0000${literals.length - 1}\u0000"`;
  });
  const decommented = masked.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  return decommented.replace(/"\u0000(\d+)\u0000"/g, (_, i) => literals[+i] ?? '');
}

function excerptAt(text: string, index: number): string {
  return text
    .slice(Math.max(0, index - 24), Math.min(text.length, index + 48))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Scan one source blob. Kind picks the comment stripper. */
export function scanDualBookText(text: string, kind: 'sql' | 'ts'): DualBookHit[] {
  const body = kind === 'sql' ? stripSqlComments(text) : stripTsCommentsKeepStrings(text);
  const hits: DualBookHit[] = [];

  for (const rule of JAVA_WALLET_IDS) {
    rule.re.lastIndex = 0;
    const m = rule.re.exec(body);
    if (m) hits.push({ id: rule.id, why: rule.why, excerpt: excerptAt(body, m.index) });
  }

  CREATE_TABLE.lastIndex = 0;
  for (const m of body.matchAll(CREATE_TABLE)) {
    const schema = m[1] ?? m[2] ?? 'ledger';
    const table = m[3] ?? m[4];
    if (!table) continue;
    if (schema !== 'ledger') {
      hits.push({
        id: `schema:${schema}.${table}`,
        why: 'table outside ledger schema',
        excerpt: excerptAt(body, m.index),
      });
    }
    if (!ONE_BOOK_TABLES.has(table)) {
      hits.push({
        id: `table:${table}`,
        why: 'CREATE TABLE is not the one book',
        excerpt: excerptAt(body, m.index),
      });
    }
  }

  if (kind === 'ts') {
    DRIZZLE_TABLE.lastIndex = 0;
    for (const m of body.matchAll(DRIZZLE_TABLE)) {
      const table = m[1]!;
      if (!ONE_BOOK_TABLES.has(table)) {
        hits.push({ id: `drizzle:${table}`, why: 'drizzle table is not the one book', excerpt: excerptAt(body, m.index) });
      }
    }
    PG_TABLE.lastIndex = 0;
    for (const m of body.matchAll(PG_TABLE)) {
      hits.push({ id: `pgTable:${m[1]}`, why: 'pgTable (public schema) is a second book', excerpt: excerptAt(body, m.index) });
    }
    PG_SCHEMA.lastIndex = 0;
    for (const m of body.matchAll(PG_SCHEMA)) {
      hits.push({ id: `pgSchema:${m[1]}`, why: 'pgSchema in ledger-client is a second book', excerpt: excerptAt(body, m.index) });
    }
  }

  CREATE_SCHEMA.lastIndex = 0;
  for (const m of body.matchAll(CREATE_SCHEMA)) {
    const schema = m[1] ?? m[2];
    if (schema) {
      hits.push({
        id: `createSchema:${schema}`,
        why: 'CREATE SCHEMA in ledger-client is a second book',
        excerpt: excerptAt(body, m.index),
      });
    }
  }

  return hits;
}

function walk(dir: string, pred: (name: string, full: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'coverage') continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, pred, out);
    else if (pred(name, full)) out.push(full);
  }
  return out;
}

function scanProductionTree(): { readonly files: number; readonly hits: readonly (DualBookHit & { file: string })[] } {
  const files = [
    ...walk(join(PACKAGE_ROOT, 'drizzle'), (n) => n.endsWith('.sql')),
    ...walk(join(PACKAGE_ROOT, 'scripts'), (n) => n.endsWith('.ts') && !n.endsWith('.test.ts')),
    ...walk(join(PACKAGE_ROOT, 'src'), (n) => n.endsWith('.ts') && !n.endsWith('.test.ts')),
  ];
  const java = walk(PACKAGE_ROOT, (n) => n.endsWith('.java'));
  const hits: (DualBookHit & { file: string })[] = [];
  for (const file of java) {
    hits.push({
      file: relative(PACKAGE_ROOT, file).replace(/\\/g, '/'),
      id: 'java-file',
      why: 'Java source in ledger-client',
      excerpt: file,
    });
  }
  for (const file of files) {
    const rel = relative(PACKAGE_ROOT, file).replace(/\\/g, '/');
    const kind = file.endsWith('.sql') ? 'sql' : 'ts';
    for (const hit of scanDualBookText(readFileSync(file, 'utf8'), kind)) {
      hits.push({ file: rel, ...hit });
    }
  }
  return { files: files.length, hits };
}

function createdOneBookTables(): Set<string> {
  const names = new Set<string>();
  const files = [
    ...walk(join(PACKAGE_ROOT, 'drizzle'), (n) => n.endsWith('.sql') && !n.endsWith('.down.sql')),
    ...walk(join(PACKAGE_ROOT, 'scripts'), (n) => n === 'migrate.ts'),
  ];
  const re = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:(?:"[^"]+"|[A-Za-z_][\w]*)\s*\.\s*)?(?:"([^"]+)"|([A-Za-z_][\w]*))/gi;
  for (const file of files) {
    const body = stripSqlComments(readFileSync(file, 'utf8'));
    for (const m of body.matchAll(re)) {
      const table = m[1] ?? m[2];
      if (table) names.add(table);
    }
  }
  return names;
}

describe('H8 companion — dual-book scan in ledger-client', () => {
  it('scanner refuses a planted Java wallet table (fail-closed)', () => {
    const hits = scanDualBookText('CREATE TABLE IF NOT EXISTS member_wallet (id bigint, balance numeric);', 'sql');
    expect(hits.some((h) => h.id === 'member_wallet' || h.id === 'table:member_wallet')).toBe(true);
  });

  it('scanner refuses a planted extra ledger table', () => {
    const hits = scanDualBookText('CREATE TABLE "ledger"."user_wallets" (balance numeric);', 'sql');
    expect(hits.some((h) => h.id === 'table:user_wallets')).toBe(true);
  });

  it('scanner refuses a planted public-schema book and wallet mutator', () => {
    const sqlHits = scanDualBookText('CREATE TABLE pay.balances (owner text, amount numeric);', 'sql');
    expect(sqlHits.some((h) => h.id.startsWith('schema:pay'))).toBe(true);
    const tsHits = scanDualBookText(
      `import { pgSchema, pgTable } from 'drizzle-orm/pg-core';
       const wallet = pgSchema('wallet');
       export const wallets = pgTable('wallets', {});
       function credit() { increaseBalance(1); }`,
      'ts',
    );
    expect(tsHits.some((h) => h.id === 'pgSchema:wallet')).toBe(true);
    expect(tsHits.some((h) => h.id.startsWith('pgTable:'))).toBe(true);
    expect(tsHits.some((h) => h.id === 'increaseBalance')).toBe(true);
  });

  it('scanner refuses a planted heldBalances map (second in-process book)', () => {
    const hits = scanDualBookText('const heldBalances = new Map<string, Amount>();', 'ts');
    expect(hits.some((h) => h.id === 'heldBalances')).toBe(true);
  });

  it('MemoryLedger one-book map is not a second book', () => {
    expect(scanDualBookText('private readonly balancesByAccountId = new Map<string, Amount>();', 'ts')).toEqual([]);
  });

  it('scanner stays quiet on a commented member_wallet (prose is not a book)', () => {
    expect(scanDualBookText('-- leftover member_wallet from vendor, do not recreate\n', 'sql')).toEqual([]);
    expect(scanDualBookText('// MemberWalletDao is banned; we post through ledger-client\n', 'ts')).toEqual([]);
  });

  it('walks production src in this package only (empty walk is a failed scan)', () => {
    const { files, hits } = scanProductionTree();
    expect(files).toBeGreaterThan(10);
    expect(hits, hits.map((h) => `${h.file}: ${h.id} (${h.why})`).join('\n')).toEqual([]);
  });

  it('this package has no SQL book — a CREATE TABLE here is a second book', () => {
    const created = createdOneBookTables();
    expect([...created]).toEqual([]);
  });
});
