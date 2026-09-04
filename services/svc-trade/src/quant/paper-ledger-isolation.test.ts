/**
 * CARD R-quant — paper place never ledger-posts.
 * Source scan of placePaperOrderIsolated: a spy on a client this method
 * does not hold would stay green after someone added ledger.post here.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const TRADE_SERVICE = join(here, '..', 'spot', 'trade-service.ts');

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

describe('R-quant paper place never posts to the ledger', () => {
  const source = readFileSync(TRADE_SERVICE, 'utf8');

  it('routes paper markets into placePaperOrderIsolated before the hold', () => {
    expect(source).toContain('if (market.paper)');
    expect(source).toContain('return this.placePaperOrderIsolated(');
    expect(source).toMatch(/Stage-1 paper isolation[\s\S]*post orderHold \/ tradeFill/);
  });

  it('placePaperOrderIsolated body has no ledger.post / orderHold / tradeFill', () => {
    const match = source.match(/private async placePaperOrderIsolated\([\s\S]*?\n  async cancelOrder\(/);
    expect(match, 'placePaperOrderIsolated must exist in trade-service.ts').not.toBeNull();
    const body = stripComments(match?.[0] ?? '');
    expect(body).not.toMatch(/this\.ledger\.post/);
    expect(body).not.toMatch(/\bledger\.post\b/);
    expect(body).not.toMatch(/recipes\.orderHold/);
    expect(body).not.toMatch(/recipes\.tradeFill/);
    expect(body).toMatch(/hold_amount[\s\S]*formatAmount\(0n\)/);
  });
});
