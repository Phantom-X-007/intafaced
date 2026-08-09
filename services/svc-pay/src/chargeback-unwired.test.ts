import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Chargeback residual — honest absent wire (W4/W5 park).
 *
 * Recipes live in packages/ledger-client with an owner sign-off banner.
 * svc-pay must not import or call them until Nitro signs off. `disputed`
 * exists in the status map as a dead end with no writer.
 */

const here = dirname(fileURLToPath(import.meta.url));

describe('chargeback wire — honest absent', () => {
  it('payment-service does not import chargeback recipes', () => {
    const src = readFileSync(join(here, 'payment-service.ts'), 'utf8');
    expect(src).not.toMatch(/recipes\.chargeback|from ['"].*chargeback/);
    expect(src).not.toMatch(/chargebackOpen|chargebackWon|chargebackShortfall/);
  });

  it('router has no dispute / chargeback procedure', () => {
    const src = readFileSync(join(here, 'router.ts'), 'utf8');
    expect(src).not.toMatch(/chargeback|dispute\.(open|accept|contest)/i);
  });

  it('ledger-client chargeback file still carries the owner sign-off banner', () => {
    const recipe = readFileSync(join(here, '../../../packages/ledger-client/src/recipes/chargeback.ts'), 'utf8');
    expect(recipe).toMatch(/OWNER SIGN-OFF REQUIRED/);
    expect(recipe).toMatch(/NOT WIRED/);
  });
});
