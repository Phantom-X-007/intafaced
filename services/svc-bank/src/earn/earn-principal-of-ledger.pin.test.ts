import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('earn principalOf/poolSize are ledger-backed', () => {
  it('gates on earnStakeAccount balances and refuses table/ledger drift', () => {
    const src = readFileSync(join(here, 'earn-service.ts'), 'utf8');
    const poolSize = src.slice(src.indexOf('async poolSize('), src.indexOf('async deposit('));
    const principalOf = src.slice(src.indexOf('async principalOf('), src.indexOf('async stakedOf('));

    for (const body of [poolSize, principalOf]) {
      expect(body).toMatch(/earnStakeAccount\(/);
      expect(body).toMatch(/this\.ledger\.balance/);
      expect(body).toMatch(/stakePrincipalForAccrual\(/);
      expect(body).not.toMatch(/COALESCE\(SUM\(principal\)/);
      expect(body).not.toMatch(/return parseAmount\(rows\[0\]\?\.total/);
    }
  });
});
