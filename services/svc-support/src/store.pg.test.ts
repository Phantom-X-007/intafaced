import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { assertTestDatabase, postgresAvailable } from '@intafaced/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresSupportStore } from './store.js';

/**
 * PostgresSupportStore — multi-replica claim exclusivity is the load-bearing
 * property. Memory cannot prove two workers racing the same row.
 */

const URL = process.env.TEST_DATABASE_URL_SUPPORT ?? 'postgres://svc_support:svc_support@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(join(here, '..', 'drizzle', '0000_support_init.sql'), 'utf8');

const USER = '11111111-1111-4111-8111-111111111111';
const OP_A = '33333333-3333-4333-8333-333333333333';
const OP_B = '44444444-4444-4444-8444-444444444444';

const available = await postgresAvailable(URL);
const sql = available ? postgres(URL, { max: 4, onnotice: () => undefined }) : null;

if (available && sql) {
  await assertTestDatabase(sql, 'svc-support store.pg.test');
  // Ensure schema exists for fresh CI databases (role owns support schema).
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS support`).catch(() => undefined);
  await sql.unsafe(MIGRATION).catch(() => undefined);
}

afterAll(async () => {
  if (sql) await sql.end({ timeout: 5 });
});

describe.skipIf(!available)('PostgresSupportStore — durable desk', () => {
  const store = () => new PostgresSupportStore(sql!);

  beforeEach(async () => {
    await sql!`DELETE FROM support.comments`;
    await sql!`DELETE FROM support.tickets`;
  });

  it('creates and lists tickets by owner', async () => {
    const s = store();
    const t = await s.createTicket({
      userId: USER,
      category: 'account',
      subject: 'Cannot sign in',
      body: 'Help',
    });
    expect(t.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(t).not.toHaveProperty('balance');
    expect(await s.listByUser(USER)).toHaveLength(1);
    expect(await s.listByUser('22222222-2222-4222-8222-222222222222')).toHaveLength(0);
  });

  it('two concurrent claims: exactly one operator wins', async () => {
    const s = store();
    const t = await s.createTicket({
      userId: USER,
      category: 'deposit_withdraw',
      subject: 'Pending deposit',
      body: 'Details',
    });

    const [a, b] = await Promise.all([
      s.claimTicket({ ticketId: t.id, operatorId: OP_A }),
      s.claimTicket({ ticketId: t.id, operatorId: OP_B }),
    ]);

    const wins = [a, b].filter((r) => r.status === 'ok');
    const losses = [a, b].filter((r) => r.status === 'refuse');
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
    if (losses[0]!.status === 'refuse') expect(losses[0]!.reason).toBe('already_claimed');

    const final = await s.findById(t.id);
    expect(final?.assigneeId).toBeTruthy();
    expect([OP_A, OP_B]).toContain(final!.assigneeId);
  });
});
