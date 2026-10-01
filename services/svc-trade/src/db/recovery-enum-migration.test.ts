import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const drizzle = join(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

function sql(name: string): string {
  return readFileSync(join(drizzle, name), 'utf8');
}

describe('recovery_required enum migration', () => {
  it('adds the enum value in its own file so the transaction can commit', () => {
    const file = sql('0033_order_recovery_required.sql');
    expect(file).toContain("ADD VALUE IF NOT EXISTS 'recovery_required'");
    expect(file).not.toMatch(/\bCHECK\b/);
    expect(file).not.toContain('recovery_reason');
    expect(file).not.toContain('reconciliation_key');
  });

  it('names the new value only in the later evidence migration', () => {
    const file = sql('0047_order_recovery_evidence.sql');
    expect(file).toContain('recovery_reason');
    expect(file).toContain('reconciliation_key');
    expect(file).toContain('orders_recovery_evidence_ck');
    expect(file).toContain("'recovery_required'");
    expect(file).not.toMatch(/ADD VALUE/i);
  });
});
