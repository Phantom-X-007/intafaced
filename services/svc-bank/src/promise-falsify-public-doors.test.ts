/**
 * Unit card (D26-P2-01e):
 * Promise: earn / cards / ramps refuse invent through mounted tRPC public doors
 *   (createBankRouter + signed createEdgeContext) — not service-unit-only guards.
 * Break: underfunded earn accrual could invent yield; JIT card auth could invent
 *   an FX rate when rates are unset; ramp money paths could invent a rail or
 *   a fiat PSP when the programme / socket is absent.
 * Done bar:
 *   · ops.accrueInterest on an unfunded pool → PRECONDITION_FAILED /
 *     bank.pool_underfunded; principal untouched; day not consumed.
 *   · cards.issue + ops.cardAuthorize with settlement ≠ funding and no rates →
 *     PRECONDITION_FAILED / bank.mark_missing; no authorization row; no hold.
 *   · ramps.offramp / ops.creditOnramp with programme none → PRECONDITION_FAILED /
 *     bank.no_ramp_rail; fiat kind → bank.fiat_ramp_socket before any row.
 * Class: N (honesty) / M surface (no invent yields or §8 rates). Leverage:
 *   createBankRouter + createBankServices + MemoryLedger (Phase A shell/ledger).
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { MemoryLedger, parseAmount as amt, recipes, userAvailable } from '@intafaced/ledger-client';
import { memoryLedgerHistory } from './analytics/ledger-history.js';
import { createBankServices } from './bank-service.js';
import { CARD_ISSUER_SETTINGS, cardIssuerFor } from './cards/issuer.js';
import { noConversionRates } from './cards/conversion.js';
import { createBankRouter } from './router.js';
import { CRYPTO_LEDGER_PROGRAMME, NO_RAMP_PROGRAMME, RAMP_SETTINGS, rampProgrammeFor } from './ramps/rails.js';

const SECRET = 'bank-promise-falsify-public-doors-secret-32b';
const HOLDER = '11111111-1111-4111-8111-111111111111';
const OPERATOR = '33333333-3333-4333-8333-333333333333';

const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', 'drizzle');
const MIGRATIONS = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';

// ═══════════════════════════════════════════════════════════════════════════════
// Closed selectors — rates / programmes unset mean refuse, never invent.
// ═══════════════════════════════════════════════════════════════════════════════

describe('D26-P2-01e refuse-closed defaults (no invent)', () => {
  it('card issuer silence is none — never the simulator', () => {
    expect([...CARD_ISSUER_SETTINGS]).toEqual(['none', 'card-sim']);
    expect(cardIssuerFor('none').programme.id).toBe('none');
  });

  it('conversion rates unset expose an empty mark set — not a synthetic FX', async () => {
    expect((await noConversionRates.marks(['BTC', 'USDT', 'IFC'], 'USDT')).size).toBe(0);
  });

  it('ramp silence is none — every money path must refuse bank.no_ramp_rail', () => {
    expect([...RAMP_SETTINGS]).toEqual(['none', 'crypto-ledger']);
    expect(rampProgrammeFor('none')).toBe(NO_RAMP_PROGRAMME);
    expect(rampProgrammeFor('none').cryptoRail).toBeNull();
  });
});

const available = await postgresAvailable(DB_URL);

if (!available) {
  describe.skip('D26-P2-01e public doors (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'bank', url: DB_URL, migrations: MIGRATIONS });
  const sql = db.sql;
  const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-bank' });

  afterAll(async () => {
    await db.drop();
  }, 30_000);

  function principal(overrides: Partial<Principal> = {}): Principal {
    return {
      sub: HOLDER,
      userId: HOLDER,
      sid: '22222222-2222-4222-8222-222222222222',
      scopes: ['bank:read', 'bank:write'],
      tier: 'full',
      mfa: true,
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    } as Principal;
  }

  function caller(bank: ReturnType<typeof createBankServices>, p: Principal = principal()) {
    const raw = encodePrincipal(p);
    return createBankRouter(bank).createCaller(
      edgeContext({
        headers: {
          'x-intafaced-principal': raw,
          'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
          'x-intafaced-region': 'DE',
        },
        id: `req-${randomUUID()}`,
      }),
    );
  }

  async function fund(ledger: MemoryLedger, userId: string, assetId: string, value: string) {
    await ledger.post(
      recipes.deposit({
        userId,
        assetId,
        amount: amt(value),
        rail: 'test',
        railRef: `${userId}:${assetId}:${randomUUID()}`,
      }),
    );
  }

  describe('D26-P2-01e public doors — earn refuse invent yields', () => {
    let ledger: MemoryLedger;
    let bank: ReturnType<typeof createBankServices>;

    beforeEach(async () => {
      await sql`
        TRUNCATE bank.interest_accruals, bank.earn_positions, bank.earn_pools
        RESTART IDENTITY CASCADE
      `;
      ledger = new MemoryLedger();
      bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger));
    });

    it('ops.accrueInterest refuses an unfunded pool by name and invents no yield', async () => {
      const pool = await bank.earn.createPool({
        assetId: 'USDT',
        kind: 'flexible',
        name: 'Unfunded invent probe',
        aprBps: 3650,
      });
      await fund(ledger, HOLDER, 'USDT', '1000');
      // Seed position with a past opened_at so the accrual day is interest-eligible.
      // The refuse under test is the ops.accrueInterest public door, not deposit.
      await bank.earn.deposit({
        poolId: pool.id,
        userId: HOLDER,
        amount: amt('1000'),
        now: new Date('2026-03-01T00:00:00.000Z'),
      });
      expect((await ledger.balance(userAvailable(HOLDER, 'USDT'))).amount).toBe(0n);

      const ops = caller(bank, principal({ sub: OPERATOR, userId: OPERATOR, scopes: ['admin:treasury'] }));
      await expect(
        ops.ops.accrueInterest({ poolId: pool.id, at: '2026-03-02T00:00:00.000Z' }),
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        cause: { code: 'bank.pool_underfunded' },
      });

      // No invented interest in available; accrual day not consumed.
      expect((await ledger.balance(userAvailable(HOLDER, 'USDT'))).amount).toBe(0n);
      const rows = await sql`SELECT id FROM bank.interest_accruals WHERE pool_id = ${pool.id}`;
      expect(rows).toHaveLength(0);
    });

    it('ops.accrueInterest (all pools) reports underfunded failure without inventing paid', async () => {
      const empty = await bank.earn.createPool({
        assetId: 'USDT',
        kind: 'flexible',
        name: 'Empty first',
        aprBps: 5000,
      });
      await fund(ledger, HOLDER, 'USDT', '1000');
      await bank.earn.deposit({
        poolId: empty.id,
        userId: HOLDER,
        amount: amt('1000'),
        now: new Date('2026-03-01T00:00:00.000Z'),
      });

      const ops = caller(bank, principal({ sub: OPERATOR, userId: OPERATOR, scopes: ['admin:treasury'] }));
      const report = await ops.ops.accrueInterest({ at: '2026-03-02T00:00:00.000Z' });

      expect(report.failures).toEqual(
        expect.arrayContaining([expect.objectContaining({ poolId: empty.id, code: 'bank.pool_underfunded' })]),
      );
      expect(report.results.some((r) => r.poolId === empty.id)).toBe(false);
      expect((await ledger.balance(userAvailable(HOLDER, 'USDT'))).amount).toBe(0n);
    });
  });

  describe('D26-P2-01e public doors — cards refuse invent rates', () => {
    let ledger: MemoryLedger;
    let bank: ReturnType<typeof createBankServices>;

    beforeEach(async () => {
      await sql`
        TRUNCATE bank.card_cashback, bank.card_settlements, bank.card_conversions,
                 bank.card_authorizations, bank.cards
        RESTART IDENTITY CASCADE
      `;
      ledger = new MemoryLedger();
      // Simulator reachable, rates unset — shipping honest default for FX.
      bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        cards: { issuer: cardIssuerFor('card-sim') },
      });
    });

    it('ops.cardAuthorize refuses JIT conversion when rates are unset (no invent FX)', async () => {
      await fund(ledger, HOLDER, 'BTC', '1');
      const user = caller(bank);
      const card = await user.cards.issue({
        cardId: randomUUID(),
        assetId: 'BTC',
        settlementAssetId: 'USDT',
        perAuthorizationLimit: '1',
      });

      const ops = caller(bank, principal({ sub: OPERATOR, userId: OPERATOR, scopes: ['admin:treasury'] }));
      await expect(
        ops.ops.cardAuthorize({
          cardId: card.id,
          authorizationRef: `auth-${randomUUID()}`,
          amount: '100',
        }),
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        cause: { code: 'bank.mark_missing' },
      });

      expect(await user.cards.authorizations({ cardId: card.id })).toEqual([]);
      expect((await ledger.balance(userAvailable(HOLDER, 'BTC'))).amount).toBe(amt('1'));
    });

    it('cards.issue refuses when no issuer is configured — never invents a programme', async () => {
      const bare = createBankServices(sql, ledger, memoryLedgerHistory(ledger));
      await expect(
        caller(bare).cards.issue({
          cardId: randomUUID(),
          assetId: 'USDT',
          perAuthorizationLimit: '250',
        }),
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        cause: { code: 'bank.no_card_issuer' },
      });
    });
  });

  describe('D26-P2-01e public doors — ramps refuse invent rails', () => {
    let ledger: MemoryLedger;

    beforeEach(async () => {
      await sql`TRUNCATE bank.ramp_onramps, bank.ramp_offramps RESTART IDENTITY CASCADE`;
      ledger = new MemoryLedger();
    });

    it('ramps.offramp refuses when programme is unset (bank.no_ramp_rail)', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger));
      await fund(ledger, HOLDER, 'USDT', '50');
      await expect(
        caller(bank).ramps.offramp({
          offrampId: randomUUID(),
          assetId: 'USDT',
          amount: '10',
          kind: 'crypto',
          destinationRef: '0xdead',
          clientRef: `c-${randomUUID()}`,
        }),
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        cause: { code: 'bank.no_ramp_rail' },
      });
      expect((await ledger.balance(userAvailable(HOLDER, 'USDT'))).amount).toBe(amt('50'));
      const rows = await sql`SELECT count(*)::text AS c FROM bank.ramp_offramps`;
      expect(rows[0]?.c).toBe('0');
    });

    it('ops.creditOnramp refuses fiat by socket name before inventing a PSP row', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        ramps: { programme: CRYPTO_LEDGER_PROGRAMME },
      });
      const ops = caller(bank, principal({ sub: OPERATOR, userId: OPERATOR, scopes: ['admin:treasury'] }));
      await expect(
        ops.ops.creditOnramp({
          userId: HOLDER,
          assetId: 'USDT',
          amount: '10',
          kind: 'fiat',
          railRef: `fiat-${randomUUID()}`,
        }),
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        cause: { code: 'bank.fiat_ramp_socket' },
      });
      const rows = await sql`SELECT count(*)::text AS c FROM bank.ramp_onramps`;
      expect(rows[0]?.c).toBe('0');
      expect((await ledger.balance(userAvailable(HOLDER, 'USDT'))).amount).toBe(0n);
    });

    it('ops.creditOnramp refuses when programme is none — no invent deposit', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        ramps: { programme: NO_RAMP_PROGRAMME },
      });
      const ops = caller(bank, principal({ sub: OPERATOR, userId: OPERATOR, scopes: ['admin:treasury'] }));
      await expect(
        ops.ops.creditOnramp({
          userId: HOLDER,
          assetId: 'USDT',
          amount: '10',
          kind: 'crypto',
          railRef: `none-${randomUUID()}`,
        }),
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        cause: { code: 'bank.no_ramp_rail' },
      });
    });
  });
}
