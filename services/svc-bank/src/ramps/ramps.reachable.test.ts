import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { MemoryLedger, parseAmount as amt } from '@intafaced/ledger-client';
import { createBankServices } from '../bank-service.js';
import { memoryLedgerHistory } from '../analytics/ledger-history.js';
import { createBankRouter } from '../router.js';
import { CRYPTO_LEDGER_PROGRAMME, NO_RAMP_PROGRAMME, RAMP_SETTINGS, rampProgrammeFor } from './rails.js';

/**
 * CAN ANYBODY ACTUALLY CALL RAMPS? (D-S-09 / D-S-15 posture)
 *
 * Enters through createBankRouter + signed createEdgeContext — never RampService
 * directly — so wiring regressions fail here.
 */

const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const MIGRATIONS = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const EDGE_SECRET = 'a-bank-ramps-reachability-edge-secret-long-enough';
const HOLDER = '11111111-1111-4111-8111-111111111111';
const OPERATOR = '33333333-3333-4333-8333-333333333333';

describe('rampProgrammeFor is total over the closed setting set', () => {
  it('enumerates exactly none and crypto-ledger', () => {
    expect([...RAMP_SETTINGS]).toEqual(['none', 'crypto-ledger']);
    expect(rampProgrammeFor('none').id).toBe('none');
    expect(rampProgrammeFor('crypto-ledger').simulated).toBe(true);
  });
});

const available = await postgresAvailable(DB_URL);

if (!available) {
  describe.skip('svc-bank ramps reachable (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'bank', url: DB_URL, migrations: MIGRATIONS });
  const sql = db.sql;
  const edgeContext = createEdgeContext({ secret: EDGE_SECRET, serviceName: 'svc-bank' });

  function principal(overrides: Partial<Principal> = {}): Principal {
    return {
      sub: HOLDER,
      userId: HOLDER,
      sid: '22222222-2222-4222-8222-222222222222',
      scopes: ['bank:read', 'bank:write'],
      tier: 'full',
      mfa: false,
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    } as Principal;
  }

  function signed(p: Principal) {
    const raw = encodePrincipal(p);
    return edgeContext({
      headers: {
        'x-intafaced-principal': raw,
        'x-intafaced-principal-sig': signPrincipalHeader(raw, EDGE_SECRET, 'DE'),
        'x-intafaced-region': 'DE',
      },
      id: 'req-signed',
    });
  }

  afterAll(async () => {
    await db.drop();
  }, 30_000);

  describe('composition root default refuses', () => {
    it('programme is none when ramps option is omitted', async () => {
      const ledger = new MemoryLedger();
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger));
      const caller = createBankRouter(bank).createCaller(signed(principal()));
      const programme = await caller.ramps.programme();
      expect(programme).toEqual({
        id: 'none',
        simulated: true,
        displayName: NO_RAMP_PROGRAMME.displayName,
        cryptoRail: null,
        fiatLeg: 'socket.psp-partners',
      });
    });
  });

  describe('reachable crypto ledger half', () => {
    let ledger: MemoryLedger;

    beforeEach(async () => {
      await sql`TRUNCATE bank.ramp_offramps, bank.ramp_onramps RESTART IDENTITY CASCADE`;
      ledger = new MemoryLedger();
    });

    it('operator credits on-ramp; user off-ramps; simulated never flips', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        ramps: { programme: CRYPTO_LEDGER_PROGRAMME },
      });
      const ops = createBankRouter(bank).createCaller(
        signed(principal({ userId: OPERATOR, sub: OPERATOR, scopes: ['admin:treasury'], mfa: true })),
      );
      const user = createBankRouter(bank).createCaller(signed(principal()));

      const programme = await user.ramps.programme();
      expect(programme.simulated).toBe(true);
      expect(programme.fiatLeg).toBe('socket.psp-partners');
      expect(programme.cryptoRail).toBeTruthy();

      const credited = await ops.ops.creditOnramp({
        userId: HOLDER,
        assetId: 'USDT',
        amount: '40',
        kind: 'crypto',
        railRef: `reach-${randomUUID()}`,
      });
      expect(credited.simulated).toBe(true);
      expect(credited.status).toBe('settled');

      await expect(
        ops.ops.creditOnramp({
          userId: HOLDER,
          assetId: 'USDT',
          amount: '1',
          kind: 'fiat',
          railRef: `fiat-${randomUUID()}`,
        }),
      ).rejects.toMatchObject({ message: expect.stringMatching(/socket\.psp-partners/) });

      const offrampId = randomUUID();
      const out = await user.ramps.offramp({
        offrampId,
        assetId: 'USDT',
        amount: '15',
        kind: 'crypto',
        destinationRef: '0xdest',
        clientRef: `c-${offrampId}`,
      });
      expect(out.simulated).toBe(true);
      expect(out.status).toBe('settled');

      const listed = await user.ramps.offramps();
      expect(listed.some((r) => r.id === offrampId && r.simulated === true)).toBe(true);
    });

    it('offramp without programme refuses precondition', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        ramps: { programme: NO_RAMP_PROGRAMME },
      });
      const user = createBankRouter(bank).createCaller(signed(principal()));
      await expect(
        user.ramps.offramp({
          offrampId: randomUUID(),
          assetId: 'USDT',
          amount: '1',
          kind: 'crypto',
          destinationRef: '0x',
          clientRef: 'nope',
        }),
      ).rejects.toMatchObject({ message: expect.stringMatching(/No bank ramp programme/) });
    });

    /**
     * Residual closeout gap: the gate was real in code but unasserted end-to-end.
     * A holder with only bank:write must not be able to credit an on-ramp — that
     * is operator surface (`admin:treasury`), because a user who can invent a
     * deposit invents money.
     */
    it('refuses ops.creditOnramp for a user session without admin:treasury', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        ramps: { programme: CRYPTO_LEDGER_PROGRAMME },
      });
      const user = createBankRouter(bank).createCaller(signed(principal()));
      await expect(
        user.ops.creditOnramp({
          userId: HOLDER,
          assetId: 'USDT',
          amount: '1',
          kind: 'crypto',
          railRef: `user-try-${randomUUID()}`,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
}
