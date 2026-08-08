import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres, { type Sql } from 'postgres';
import { describe, expect, it, beforeEach, afterEach, afterAll } from 'vitest';
import { createTestDb, postgresAvailable, rewriteSchemaSql, type TestDb } from '@intafaced/db';
import { MemoryEventBus } from '@intafaced/events';
import { LedgerError, parseAmount as amt, recipes } from '@intafaced/ledger-client';
import { LedgerService } from './service.js';

/**
 * THE FREEZE IS DURABLE, or it is not a freeze.
 *
 * `reconcile()` halts the ledger when it detects drift — the single most
 * important safety action in the system. While that decision lived in one
 * process's `boolean`, three things were true and none of them acceptable: a
 * restart resumed posting, a second replica never heard about it, and the
 * operator's reason was written nowhere.
 *
 * So the tests below do not check that `freeze()` sets a field. They check that
 * a freeze on one LedgerService stops a post on a DIFFERENT LedgerService, over
 * a DIFFERENT connection, against the same database — which is the only version
 * of the claim that means anything in production.
 *
 * Requires Postgres. `docker compose up -d`. Skips cleanly when unreachable.
 */

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(here, '..', 'drizzle');

const migrations = readdirSync(drizzleDir)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzleDir, f), 'utf8'));

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('svc-ledger freeze (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDb = await createTestDb({
    service: 'ledgerfreeze',
    url: URL,
    migrations: migrations.map((body) => (schema: string) => rewriteSchemaSql(body, 'ledger', schema)),
  });

  /**
   * A SEPARATE connection pool over the same schema.
   *
   * This is the whole point of the file. Sharing `db.sql` between two
   * LedgerService objects would prove only that two objects can see one client;
   * a second pool is the closest a single test process gets to a second replica,
   * and it is what makes "B sees A's freeze" a statement about the database
   * rather than about JavaScript.
   */
  let replicas: Sql[] = [];
  function connect(): Sql {
    const sql = postgres(db.url, {
      max: 1,
      connection: { search_path: `${db.schema},public`, application_name: `${db.schema}_replica` },
      onnotice: () => undefined,
    });
    replicas.push(sql);
    return sql;
  }

  const USER = '77777777-7777-4777-8777-777777777777';
  const OPERATOR = '11111111-1111-4111-8111-111111111111';

  let busA: MemoryEventBus;
  let busB: MemoryEventBus;
  let a: LedgerService;
  let b: LedgerService;
  let sqlA: Sql;
  let sqlB: Sql;
  let seq = 0;

  /** A funded, legal post. Distinct key per call so idempotency never masks a refusal. */
  const deposit = () => recipes.deposit({ userId: USER, assetId: 'USDT', amount: amt('100'), rail: 'test', railRef: `freeze-${++seq}` });

  beforeEach(async () => {
    await db.sql`TRUNCATE ledger_entries, ledger_tx, balance_snapshots, accounts RESTART IDENTITY CASCADE`;
    await db.sql`UPDATE chain_tip SET hash = NULL, seq = 0 WHERE id = true`;
    await db.sql`UPDATE posting_freeze SET frozen = false, reason = NULL, actor = NULL WHERE id = true`;

    busA = new MemoryEventBus('a');
    busB = new MemoryEventBus('b');
    sqlA = connect();
    sqlB = connect();
    a = new LedgerService(sqlA, busA);
    b = new LedgerService(sqlB, busB);
  });

  // Each test opens its own pools; left open they would exhaust the server's
  // connection slots long before the suite finished.
  afterEach(async () => {
    const open = replicas;
    replicas = [];
    await Promise.all(open.map((sql) => sql.end({ timeout: 5 })));
  });

  afterAll(async () => {
    await db.drop();
  });

  describe('a freeze is a fact about the ledger, not about a process', () => {
    it('stops a post on a second instance that never heard the call', async () => {
      // B has posted happily up to this point and holds no knowledge of A.
      await expect(b.post(deposit())).resolves.toMatchObject({ module: 'ledger' });

      await a.freeze('suspected drift in USDT', OPERATOR);

      await expect(b.post(deposit())).rejects.toMatchObject({ code: 'ledger.frozen' });
      await expect(b.status()).resolves.toEqual({
        postingEnabled: false,
        frozenReason: 'suspected drift in USDT',
        frozenBy: OPERATOR,
      });
    });

    it('survives a restart — a process that never saw the freeze still refuses', async () => {
      await a.freeze('reconciliation mismatch', 'reconciliation');

      // Everything A and B knew is gone; this is the process that comes back up.
      const restarted = new LedgerService(connect(), new MemoryEventBus('restarted'));

      await expect(restarted.status()).resolves.toMatchObject({ postingEnabled: false, frozenBy: 'reconciliation' });
      await expect(restarted.post(deposit())).rejects.toMatchObject({ code: 'ledger.frozen' });
    });

    it('lifts on one instance and releases the other', async () => {
      await a.freeze('drift', OPERATOR);
      await expect(b.post(deposit())).rejects.toThrow(/frozen/);

      await b.unfreeze(OPERATOR);

      await expect(a.post(deposit())).resolves.toMatchObject({ module: 'ledger' });
      await expect(a.status()).resolves.toEqual({ postingEnabled: true, frozenReason: null, frozenBy: OPERATOR });
    });

    it('carries the reason to the caller, so a service can log why it was refused', async () => {
      await a.freeze('USDT totals do not net to zero', OPERATOR);

      await expect(b.post(deposit())).rejects.toThrow(/USDT totals do not net to zero/);
      await expect(b.post(deposit())).rejects.toBeInstanceOf(LedgerError);
    });

    it('still honours a retry of a transaction that already committed', async () => {
      // The value moved before the freeze. Refusing the retry would tell the
      // caller nothing happened, and have it try to make it happen again.
      const request = deposit();
      const original = await a.post(request);

      await a.freeze('halted after the fact', OPERATOR);

      await expect(b.post(request)).resolves.toMatchObject({ id: original.id, hash: original.hash });
    });
  });

  describe('reconciliation freezes durably', () => {
    it('a self-freeze reaches a second instance and is attributed to reconciliation', async () => {
      await a.post(deposit());

      // Corrupt the denormalised cache without touching the entries — the exact
      // drift `reconcileBalances` exists to catch.
      await db.sql`
        UPDATE accounts SET balance = balance + 50
         WHERE owner_type = 'user' AND owner_id = ${USER} AND asset_id = 'USDT' AND kind = 'available'
      `;

      const report = await a.reconcile();
      expect(report.ok).toBe(false);

      await expect(b.status()).resolves.toMatchObject({ postingEnabled: false, frozenBy: 'reconciliation' });
      await expect(b.post(deposit())).rejects.toMatchObject({ code: 'ledger.frozen' });
    });
  });

  describe('LEDGER_POSTING_ENABLED at boot', () => {
    it('=false freezes durably, so the decision reaches replicas nobody reconfigured', async () => {
      const configured = new LedgerService(connect(), new MemoryEventBus('boot'), { postingEnabled: false });
      await configured.applyStartupPolicy();

      await expect(b.status()).resolves.toMatchObject({ postingEnabled: false, frozenBy: 'env:LEDGER_POSTING_ENABLED' });
      await expect(b.post(deposit())).rejects.toMatchObject({ code: 'ledger.frozen' });
    });

    it('=true NEVER thaws — the database wins, and that asymmetry is the point', async () => {
      // The flag defaults to true. If a restart honoured it, every deploy, OOM
      // kill and autoscaler event would silently resume posting on a book
      // reconciliation halted — the original bug, back through the front door.
      await a.freeze('reconciliation mismatch', 'reconciliation');

      const restarted = new LedgerService(connect(), new MemoryEventBus('boot'), { postingEnabled: true });
      const state = await restarted.applyStartupPolicy();

      expect(state).toMatchObject({ frozen: true, reason: 'reconciliation mismatch', actor: 'reconciliation' });
      await expect(restarted.post(deposit())).rejects.toMatchObject({ code: 'ledger.frozen' });
    });

    it('=false on an already-frozen book leaves the original reason standing', async () => {
      await a.freeze('operator: suspected drift', OPERATOR);

      const configured = new LedgerService(connect(), new MemoryEventBus('boot'), { postingEnabled: false });
      await configured.applyStartupPolicy();

      // Overwriting would erase the only record of why the platform is down.
      await expect(configured.status()).resolves.toMatchObject({ frozenReason: 'operator: suspected drift', frozenBy: OPERATOR });
    });
  });

  describe('freeze attribution is sticky (STOP §4.2b #3)', () => {
    it('refuses a second freeze with different reason/actor at the writeFreeze layer', async () => {
      const { writeFreeze: write } = await import('./ledger/freeze.js');
      await write(connect(), { frozen: true, reason: 'operator halt', actor: OPERATOR });
      await expect(write(connect(), { frozen: true, reason: 'reconciliation mismatch', actor: 'reconciliation' })).rejects.toMatchObject({
        code: 'ledger.freeze_attributed',
      });

      const state = await a.freezeState();
      expect(state).toMatchObject({ frozen: true, reason: 'operator halt', actor: OPERATOR });
    });

    it('service.freeze leaves the first attribution standing when recon tries to clobber', async () => {
      await a.freeze('operator: suspected drift', OPERATOR);
      // Recon path: freeze() must not throw and must not overwrite.
      const after = await a.freeze('reconciliation mismatch', 'reconciliation');
      expect(after).toMatchObject({ frozen: true, reason: 'operator: suspected drift', actor: OPERATOR });
    });

    it('same attribution re-freeze is a no-op, not a fight', async () => {
      await a.freeze('drift', OPERATOR);
      const again = await a.freeze('drift', OPERATOR);
      expect(again).toMatchObject({ frozen: true, reason: 'drift', actor: OPERATOR });
    });
  });

  describe('the rest of the OS is told', () => {
    it('emits ledgerFreezeUpdated in both directions, with who and why', async () => {
      await a.freeze('drift', OPERATOR);
      await a.unfreeze(OPERATOR);

      const emitted = busA.emitted('ledgerFreezeUpdated');
      expect(emitted).toHaveLength(2);
      expect(emitted[0]!.payload).toMatchObject({ frozen: true, reason: 'drift', actor: OPERATOR });
      expect(emitted[1]!.payload).toMatchObject({ frozen: false, reason: null, actor: OPERATOR });
      expect(emitted[0]!.subject).toBe('intafaced.ledger.freeze.updated');
    });

    it('timestamps the change from the database, not the publishing process', async () => {
      // Two replicas disagreeing about the wall clock must not be able to
      // disagree about the order the platform was halted and resumed in.
      const before = await db.sql<Array<{ now: Date }>>`SELECT now() AS now`;
      await a.freeze('drift', OPERATOR);
      const [row] = await db.sql<Array<{ changed_at: Date }>>`SELECT changed_at FROM posting_freeze WHERE id = true`;

      const [emitted] = busA.emitted('ledgerFreezeUpdated');
      expect(emitted!.payload.changedAt).toBe(row!.changed_at.toISOString());
      expect(row!.changed_at.getTime()).toBeGreaterThanOrEqual(before[0]!.now.getTime());
    });

    it('keys the envelope on the column precision, so a same-millisecond thaw survives', async () => {
      // STOP §4.2b #7. `freeze-event-key.test.ts` proves the arithmetic without a
      // database; this proves the value actually reaching the bus is the one the
      // DATABASE produced, not a Date round-trip that has already dropped the
      // microseconds. Those are two different claims and both have to hold.
      await a.freeze('drift', OPERATOR);
      const [row] = await db.sql<Array<{ precise: string }>>`
        SELECT changed_at::text AS precise FROM posting_freeze WHERE id = true
      `;

      const [emitted] = busA.emitted('ledgerFreezeUpdated');
      expect(emitted!.idempotencyKey).toBe(`ledger.freeze:${row!.precise}`);

      // And the freeze/thaw pair never share an identity, however fast it is.
      await a.unfreeze(OPERATOR);
      const keys = busA.emitted('ledgerFreezeUpdated').map((e) => e.idempotencyKey);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe('the database refuses an unattributed freeze', () => {
    it('rejects frozen = true with no reason and no actor', async () => {
      // Belt and braces, as everywhere else in this schema: a bug in the
      // service must not be able to halt the platform anonymously.
      await expect(db.sql`UPDATE posting_freeze SET frozen = true WHERE id = true`).rejects.toThrow(/posting_freeze_attributed_ck/);
    });
  });
}
