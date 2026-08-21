import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Ambassador programme posts nothing. Appoint/freeze/unfreeze/residency are
 * non-money; IFC pay / revenue share are refuse-closed Class M.
 *
 * Same argument as paper/ledger-isolation.test.ts: a spy on a non-existent
 * ledger client would stay green after someone imports recipes into ifc-pay.
 * Source scan of ambassadors modules + the pay wire region of router.ts.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url));

const FORBIDDEN: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  { pattern: /\bLedgerClient\b/, why: 'the ledger client — ambassadors hold no balance' },
  { pattern: /\bReadOnlyLedgerClient\b/, why: 'even the read client: no real balance read for pay refuse' },
  { pattern: /\brecipes\b/, why: 'a ledger recipe assembles a real double-entry posting' },
  { pattern: /\bmemory-ledger\b|\bMemoryLedger\b/, why: 'a second book, which §0.6 forbids' },
  { pattern: /\borderHold\b|\btradeFill\b/, why: 'trade recipes must never fire from academy ambassadors' },
  { pattern: /\bPostRequest\b|\bEntryInput\b/, why: 'the shape of a ledger posting' },
  { pattern: /\.post\s*\(/, why: 'a posting call' },
  { pattern: /\bAccountRef\b|\baccounts\.js\b/, why: 'ledger account addressing' },
];

/** Invented rate/amount seeds on the pay plane — also refuse. */
const FORBIDDEN_INVENT: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  { pattern: /\bifcRate\s*[:=]/, why: 'invented IFC session rate' },
  { pattern: /\brevenueShareBps\s*[:=]/, why: 'invented revenue share bps' },
  { pattern: /\bpayAmount\s*[:=]/, why: 'invented pay amount field' },
];

function ambassadorSources(): { readonly name: string; readonly text: string }[] {
  return readdirSync(HERE)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((name) => ({ name, text: readFileSync(join(HERE, name), 'utf8') }));
}

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

function payWireRegion(): string {
  const routerPath = join(HERE, '..', 'router.ts');
  const text = readFileSync(routerPath, 'utf8');
  const start = text.indexOf('ambassadorPayPlane:');
  const end = text.indexOf('// ── Residency applications');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('router.ts ambassador pay region markers not found');
  }
  return stripComments(text.slice(start, end));
}

describe('ambassadors ledger isolation (source scan)', () => {
  it('no ambassador module imports ledger write surface or invents rates', () => {
    for (const { name, text } of ambassadorSources()) {
      const body = stripComments(text);
      for (const rule of FORBIDDEN) {
        expect(body, `${name}: ${rule.why}`).not.toMatch(rule.pattern);
      }
      for (const rule of FORBIDDEN_INVENT) {
        expect(body, `${name}: ${rule.why}`).not.toMatch(rule.pattern);
      }
    }
  });

  it('pay wire region never posts or invents amounts', () => {
    const region = payWireRegion();
    for (const rule of FORBIDDEN) {
      expect(region, `router pay region: ${rule.why}`).not.toMatch(rule.pattern);
    }
    expect(region).toMatch(
      /decidePublicAmbassadorPayQuote|decidePublicResidencyPayQuote|attemptAmbassadorPay|attemptResidencyIfcPay|ambassadorPayPlaneStatus/,
    );
  });
});
