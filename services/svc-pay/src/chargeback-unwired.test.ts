import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Chargeback **ledger** residual — honest absent money wire (W4/W5 park · D26-P1-P5).
 *
 * Recipes live in packages/ledger-client with an owner sign-off banner.
 * svc-pay may open dispute **cases** and mark `disputed` status, but must not
 * import or call the ledger recipes until Nitro signs off.
 */

const here = dirname(fileURLToPath(import.meta.url));

describe('chargeback ledger wire — honest absent (D26-P1-P5)', () => {
  it('payment-service does not import chargeback recipes', () => {
    const src = readFileSync(join(here, 'payment-service.ts'), 'utf8');
    expect(src).not.toMatch(/recipes\.chargeback|from ['"].*recipes\/chargeback/);
    expect(src).not.toMatch(/chargebackOpen|chargebackWon|chargebackShortfall/);
  });

  it('router dispute procedures exist but never name ledger chargeback recipes', () => {
    const src = readFileSync(join(here, 'router.ts'), 'utf8');
    expect(src).toMatch(/openDispute|contestDispute|acceptDispute|markDisputeWon|markDisputeLost|getDispute/);
    expect(src).not.toMatch(/chargebackOpen|chargebackWon|chargebackShortfall|recipes\.chargeback/);
  });

  it('ledger-client chargeback file still carries the owner sign-off banner', () => {
    const recipe = readFileSync(join(here, '../../../packages/ledger-client/src/recipes/chargeback.ts'), 'utf8');
    expect(recipe).toMatch(/OWNER SIGN-OFF REQUIRED/);
    expect(recipe).toMatch(/NOT WIRED/);
  });
});
