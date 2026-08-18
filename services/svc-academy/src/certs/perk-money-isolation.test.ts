import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Source scan — cert grant / perk plane must never grow a ledger client or
 * invent perk-money seeds. Mirrors ambassadors/ledger-isolation.test.ts.
 */

const here = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN = [
  { pattern: /\bcreateLedgerClient\b/, why: 'ledger client on cert perk path' },
  { pattern: /\bReadOnlyLedgerClient\b/, why: 'even read ledger for invent perk money' },
  { pattern: /\bLEDGER_URL\b/, why: 'ledger env on cert perk path' },
  { pattern: /\bfeeCharge\b/, why: 'fee charge invent' },
  { pattern: /\bperkAmount\s*[:=]/, why: 'invented perk amount field' },
  { pattern: /\bifcGrant\s*[:=]/, why: 'invented IFC grant from cert' },
  { pattern: /\bCERT_TO_PERK_MAP\b/, why: 'hard-coded cert→perk second opinion' },
  { pattern: /@intafaced\/ledger-client/, why: 'ledger-client import on cert grant path' },
  { pattern: /\bLedgerClient\b/, why: 'ledger client type on cert grant path' },
] as const;

function read(name: string): string {
  return readFileSync(join(here, name), 'utf8');
}

function certSources(): { readonly name: string; readonly text: string }[] {
  return readdirSync(here)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((name) => ({ name, text: read(name) }));
}

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

describe('certs perk plane — no ledger / invent money (source scan)', () => {
  it('perk-plane.ts never posts or invents perk money', () => {
    const src = read('perk-plane.ts');
    for (const rule of FORBIDDEN) {
      expect(src, rule.why).not.toMatch(rule.pattern);
    }
    expect(src).toMatch(/refuse-closed/);
    expect(src).toMatch(/svc-identity/);
    expect(src).toMatch(/academyHoldsPerkMoney: false/);
  });

  it('every certs production module is structurally incapable of a ledger post', () => {
    for (const { name, text } of certSources()) {
      const body = stripComments(text);
      expect(body, name).not.toMatch(/\bcreateLedgerClient\b/);
      expect(body, name).not.toMatch(/\bLedgerClient\b/);
      expect(body, name).not.toMatch(/@intafaced\/ledger-client/);
      expect(body, name).not.toMatch(/\.post\s*\(/);
    }
  });

  it('xp-policy / xp-publish / grant-ledger stay money-free on the cert path', () => {
    for (const name of ['xp-policy.ts', 'xp-publish.ts', 'progress.ts', 'grant-ledger.ts'] as const) {
      const src = read(name);
      expect(src, name).not.toMatch(/\bcreateLedgerClient\b/);
      expect(src, name).not.toMatch(/\bperkAmount\s*[:=]/);
    }
    expect(read('grant-ledger.ts')).toMatch(/intafaced\.identity\.xp\.earned/);
    expect(read('grant-ledger.ts')).toMatch(/ledgerPosted: false/);
  });
});
