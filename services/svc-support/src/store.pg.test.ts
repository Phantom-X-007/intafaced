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
const MIGRATION_0001 = readFileSync(join(here, '..', 'drizzle', '0001_support_audit_and_case_file.sql'), 'utf8');

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
  // 0001 is applied without swallowing its error, unlike 0000 above. If the
  // audit trail and case-file tables cannot be created, the tests below would
  // otherwise report the append-only trigger as absent by silently exercising a
  // table that is not there — a green run proving nothing.
  await sql.unsafe(MIGRATION_0001);
}

afterAll(async () => {
  if (sql) await sql.end({ timeout: 5 });
});

describe.skipIf(!available)('PostgresSupportStore — durable desk', () => {
  const store = () => new PostgresSupportStore(sql!);

  beforeEach(async () => {
    await sql!`DELETE FROM support.comments`;
    // ticket_events and case_files cascade from tickets. They cannot be DELETEd
    // directly — the append-only triggers refuse it, which is the point.
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

/**
 * The audit trail and case file, against the database.
 *
 * Everything here is a property TypeScript cannot hold. `lifecycle.ts` says
 * `closed` is terminal and `store.ts` never UPDATEs a trail row — both true, and
 * both irrelevant to somebody with a psql prompt. These tests are the assertions
 * that the DATABASE refuses, so the guarantee survives a caller that is not this
 * codebase.
 */
describe.skipIf(!available)('audit trail and case file — enforced in Postgres', () => {
  const store = () => new PostgresSupportStore(sql!);

  beforeEach(async () => {
    await sql!`DELETE FROM support.comments`;
    await sql!`DELETE FROM support.tickets`;
  });

  const open = () => store().createTicket({ userId: USER, category: 'account', subject: 'S', body: 'B' });

  it('creating a ticket writes `opened` at sequence 1, in the same transaction', async () => {
    const t = await open();
    const trail = await store().listEvents(t.id);
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({ sequence: 1, kind: 'opened', actorRole: 'user' });
  });

  it('the trail cannot be UPDATEd', async () => {
    const t = await open();
    await expect(sql!`UPDATE support.ticket_events SET note = 'rewritten' WHERE ticket_id = ${t.id}`).rejects.toMatchObject({
      // The code, not the sentence. 'check_violation' is what the trigger raises.
      code: '23514',
    });
  });

  it('the trail of a LIVE ticket cannot be DELETEd', async () => {
    const t = await open();
    await expect(sql!`DELETE FROM support.ticket_events WHERE ticket_id = ${t.id}`).rejects.toMatchObject({ code: '23514' });
    expect(await store().listEvents(t.id)).toHaveLength(1);
  });

  it('erasing the ticket DOES take its history with it', async () => {
    // The counterpart to the test above, and the reason the trigger is not a
    // flat "no deletes": an unconditional refusal made `support.tickets` a table
    // no row could ever leave, which would have broken retention and erasure.
    const t = await open();
    await sql!`DELETE FROM support.tickets WHERE id = ${t.id}`;
    expect(await store().listEvents(t.id)).toHaveLength(0);
    const left = await sql!`SELECT 1 FROM support.ticket_events WHERE ticket_id = ${t.id}`;
    expect(left).toHaveLength(0);
  });

  it('erasing a ticket takes its case file too — no orphaned evidence', async () => {
    const s = store();
    const t = await open();
    await s.putCaseFile({
      ticketId: t.id,
      escalatedBy: OP_A,
      reason: 'other',
      citations: [{ kind: 'kb_article', ref: 'kb-account-access', digest: 'a'.repeat(64), readAt: '2026-08-09T10:00:00.000Z' }],
      grounding: { status: 'unread', reason: 'plane_dark' },
      summary: 'Escalating.',
      createdAt: '2026-08-09T10:00:00.000Z',
    });
    await sql!`DELETE FROM support.tickets WHERE id = ${t.id}`;
    expect(await s.latestCaseFile(t.id)).toBeNull();
  });

  it('sequence is unique per ticket — a duplicate is refused by the index', async () => {
    const t = await open();
    await expect(
      sql!`
        INSERT INTO support.ticket_events (ticket_id, sequence, kind, actor_id, actor_role)
        VALUES (${t.id}, 1, 'escalated', ${OP_A}, 'operator')
      `,
    ).rejects.toMatchObject({ code: '23505' }); // unique_violation
  });

  it('a status_changed row that does not say what changed is refused', async () => {
    const t = await open();
    await expect(
      sql!`
        INSERT INTO support.ticket_events (ticket_id, sequence, kind, actor_id, actor_role)
        VALUES (${t.id}, 2, 'status_changed', ${OP_A}, 'operator')
      `,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('closed is terminal in the database, not only in lifecycle.ts', async () => {
    const s = store();
    const t = await open();
    expect((await s.setStatus({ ticketId: t.id, status: 'closed', operatorId: OP_A })).status).toBe('ok');
    // The service refuses this too. Here we go around the service entirely.
    await expect(sql!`UPDATE support.tickets SET status = 'open' WHERE id = ${t.id}`).rejects.toMatchObject({ code: '23514' });
  });

  it('a lifecycle move and its trail row commit together', async () => {
    const s = store();
    const t = await open();
    const moved = await s.setStatus({ ticketId: t.id, status: 'pending', operatorId: OP_A, note: 'picked up' });
    expect(moved.status).toBe('ok');

    const trail = await s.listEvents(t.id);
    expect(trail.map((e) => e.kind)).toEqual(['opened', 'status_changed']);
    expect(trail[1]).toMatchObject({ sequence: 2, fromStatus: 'open', toStatus: 'pending', actorId: OP_A, note: 'picked up' });
  });

  it('a refused lifecycle move writes no trail row', async () => {
    const s = store();
    const t = await open();
    const same = await s.setStatus({ ticketId: t.id, status: 'open', operatorId: OP_A });
    expect(same).toEqual({ status: 'refuse', reason: 'same_status' });
    expect(await s.listEvents(t.id)).toHaveLength(1);
  });

  it('a winning claim records assignment and the status move it caused', async () => {
    const s = store();
    const t = await open();
    expect((await s.claimTicket({ ticketId: t.id, operatorId: OP_A })).status).toBe('ok');
    const trail = await s.listEvents(t.id);
    expect(trail.map((e) => e.kind)).toEqual(['opened', 'assigned', 'status_changed']);
    expect(trail.map((e) => e.sequence)).toEqual([1, 2, 3]);
  });

  it('a losing claim writes no trail row at all', async () => {
    const s = store();
    const t = await open();
    await Promise.all([s.claimTicket({ ticketId: t.id, operatorId: OP_A }), s.claimTicket({ ticketId: t.id, operatorId: OP_B })]);
    const trail = await s.listEvents(t.id);
    // Exactly one operator's assignment, never two.
    expect(trail.filter((e) => e.kind === 'assigned')).toHaveLength(1);
    expect(trail.map((e) => e.sequence)).toEqual([1, 2, 3]);
  });

  it('a case file round-trips its citations and grounding through jsonb', async () => {
    const s = store();
    const t = await open();
    const caseFile = {
      ticketId: t.id,
      escalatedBy: OP_A,
      reason: 'kyc_review' as const,
      citations: [
        { kind: 'kb_article' as const, ref: 'kb-account-access', digest: 'a'.repeat(64), readAt: '2026-08-09T10:00:00.000Z' },
        { kind: 'account_state' as const, ref: USER, digest: 'b'.repeat(64), readAt: '2026-08-09T10:00:00.000Z' },
      ],
      grounding: {
        status: 'read' as const,
        state: { userId: USER, status: 'frozen' as const, kycTier: 'basic' as const },
        readAt: '2026-08-09T10:00:00.000Z',
      },
      summary: 'Tier does not match the deposit route.',
      createdAt: '2026-08-09T10:00:00.000Z',
    };
    await s.putCaseFile(caseFile);
    const read = await s.latestCaseFile(t.id);
    expect(read?.citations).toEqual(caseFile.citations);
    expect(read?.grounding).toEqual(caseFile.grounding);
    expect(read?.reason).toBe('kyc_review');
  });

  it('a case file cannot be edited after the fact', async () => {
    const s = store();
    const t = await open();
    await s.putCaseFile({
      ticketId: t.id,
      escalatedBy: OP_A,
      reason: 'other',
      citations: [{ kind: 'kb_article', ref: 'kb-account-access', digest: 'a'.repeat(64), readAt: '2026-08-09T10:00:00.000Z' }],
      grounding: { status: 'unread', reason: 'plane_dark' },
      summary: 'Escalating.',
      createdAt: '2026-08-09T10:00:00.000Z',
    });
    // A mutable case file can be brought into line with whatever the outcome
    // turned out to be, which is worse than none: it reads as contemporaneous
    // evidence while being a later reconstruction.
    await expect(sql!`UPDATE support.case_files SET summary = 'different' WHERE ticket_id = ${t.id}`).rejects.toMatchObject({
      code: '23514',
    });
    await expect(sql!`DELETE FROM support.case_files WHERE ticket_id = ${t.id}`).rejects.toMatchObject({ code: '23514' });
  });

  it('a case file citing nothing is refused by the database too', async () => {
    const t = await open();
    await expect(
      sql!`
        INSERT INTO support.case_files (ticket_id, escalated_by, reason, citations, grounding, summary)
        VALUES (${t.id}, ${OP_A}, 'other', '[]'::jsonb, '{"status":"unread","reason":"not_attempted"}'::jsonb, 'Escalating.')
      `,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('there is no money column on either new table', async () => {
    const columns = await sql!<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'support' AND table_name IN ('ticket_events', 'case_files')
    `;
    const names = columns.map((c) => c.column_name);
    expect(names.length).toBeGreaterThan(0);
    for (const banned of ['amount', 'currency', 'asset', 'balance', 'value', 'credit', 'debit', 'payout']) {
      expect(names).not.toContain(banned);
    }
  });
});
