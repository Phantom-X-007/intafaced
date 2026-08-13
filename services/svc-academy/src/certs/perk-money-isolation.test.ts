import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Source scan — cert perk plane must never grow a ledger client or invent
 * perk-money seeds. Mirrors ambassadors/ledger-isolation.test.ts for D26-P1-C1.
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
] as const;

function read(name: string): string {
  return readFileSync(join(here, name), 'utf8');
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

  it('xp-policy / xp-publish stay money-free on the cert path', () => {
    for (const name of ['xp-policy.ts', 'xp-publish.ts', 'progress.ts'] as const) {
      const src = read(name);
      expect(src, name).not.toMatch(/\bcreateLedgerClient\b/);
      expect(src, name).not.toMatch(/\bperkAmount\s*[:=]/);
    }
  });
});
