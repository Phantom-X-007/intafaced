import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('token.stakeOf is ledger-backed', () => {
  it('gates on tokenStakeAccount balances and refuses table/ledger drift', () => {
    const service = readFileSync(join(here, 'token-service.ts'), 'utf8');
    const stakeOf = service.slice(service.indexOf('async stakeOf(userId'), service.indexOf('async getStake('));
    expect(stakeOf).toMatch(/tokenStakeAccount\(/);
    expect(stakeOf).toMatch(/this\.ledger\.balance/);
    expect(stakeOf).toMatch(/token\.stake_ledger_mismatch/);
    expect(stakeOf).not.toMatch(/COALESCE\(SUM\(amount\)/);
    expect(stakeOf).not.toMatch(/return parseAmount\(rows\[0\]\?\.total/);
  });
});
