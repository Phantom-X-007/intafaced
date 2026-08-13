import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Chargeback **ledger** residual — refuse-closed named §13 socket (D26-P1-P5).
 *
 * Recipes live in packages/ledger-client with an owner sign-off banner.
 * svc-pay opens dispute **cases** and may mark `disputed` status, but must not
 * import or call the ledger recipes — refuse via `socket.pay-chargeback-ledger-wire`.
 */

const here = dirname(fileURLToPath(import.meta.url));

describe('chargeback ledger wire — refuse-closed §13 (D26-P1-P5)', () => {
  it('payment-service does not import chargeback recipes', () => {
    const src = readFileSync(join(here, 'payment-service.ts'), 'utf8');
    expect(src).not.toMatch(/recipes\.chargeback|from ['"].*recipes\/chargeback/);
    expect(src).not.toMatch(/chargebackOpen|chargebackWon|chargebackShortfall/);
  });

  it('router dispute procedures exist, name the socket, never call ledger recipes', () => {
    const src = readFileSync(join(here, 'router.ts'), 'utf8');
    expect(src).toMatch(/openDispute|contestDispute|getDispute/);
    expect(src).toMatch(/socket\.pay-chargeback-ledger-wire|ledgerSocket/);
    expect(src).not.toMatch(/chargebackOpen|chargebackWon|chargebackShortfall|recipes\.chargeback/);
  });

  it('named socket module refuses every post', () => {
    const src = readFileSync(join(here, 'fraud/chargeback-ledger-socket.ts'), 'utf8');
    expect(src).toMatch(/socket\.pay-chargeback-ledger-wire/);
    expect(src).toMatch(/pay\.chargeback_ledger_unwired/);
    expect(src).toMatch(/refuseChargebackLedgerPost/);
  });

  it('ledger-client chargeback file still carries the owner sign-off banner', () => {
    const recipe = readFileSync(join(here, '../../../packages/ledger-client/src/recipes/chargeback.ts'), 'utf8');
    expect(recipe).toMatch(/OWNER SIGN-OFF REQUIRED/);
    expect(recipe).toMatch(/NOT WIRED/);
  });

  it('coverage.yaml carries the §13 socket row', () => {
    const cov = readFileSync(join(here, '../../../tooling/coverage.yaml'), 'utf8');
    expect(cov).toMatch(/id:\s*socket\.pay-chargeback-ledger-wire/);
  });
});
