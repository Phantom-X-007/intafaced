import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('earn accrue uses ledger stake pots', () => {
  it('refuses table/ledger principal drift and pays from ledger amounts', () => {
    const src = readFileSync(join(here, 'earn-service.ts'), 'utf8');
    const helper = readFileSync(join(here, 'accrue-principal.ts'), 'utf8');
    const inner = src.slice(src.indexOf('private async accrueInner'), src.indexOf('async accrueAll('));
    expect(inner).toMatch(/earnStakeAccount\(/);
    expect(inner).toMatch(/this\.ledger\.balance/);
    expect(inner).toMatch(/stakePrincipalForAccrual\(/);
    expect(helper).toMatch(/bank\.earn_principal_mismatch/);
    expect(helper).toMatch(/return ledgerPrincipal/);
  });
});
