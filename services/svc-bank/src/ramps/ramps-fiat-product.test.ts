/**
 * D26-P1-B4 — bank.ramps fiat on/off via pay adapters COMPLETE (public doors).
 *
 * Done bar: fiat on/off reuses svc-pay RailAdapter plane; ledger-only; no second
 * book; empty/sandbox refuse the PSP socket before any row.
 *
 * Breaks caught:
 *   · live fiat money path exists only as a RampService unit test and never
 *     through createBankRouter + signed edge (composition-root regression);
 *   · a sandbox pay rail launders into bank fiat and invents a PSP;
 *   · fiat books against a bank-local rail id instead of the pay adapter id;
 *   · a second money book appears beside ledger-client deposit/withdraw.
 *
 * Enter through the mounted router. Value moves only via imported ledger-client
 * recipes on MemoryLedger. Does not touch auto-invest / business trees.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { MemoryLedger, parseAmount as amt, railBoundary, userAvailable } from '@intafaced/ledger-client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { memoryLedgerHistory } from '../analytics/ledger-history.js';
import { createBankServices } from '../bank-service.js';
import { createBankRouter } from '../router.js';
import { inRepoPayFiatRampPort, type PayFiatRampPort } from './pay-fiat-adapter.js';
import { CRYPTO_LEDGER_PROGRAMME } from './rails.js';

const SECRET = 'bank-ramps-fiat-product-boundary-secret-32';
const HOLDER = '11111111-1111-4111-8111-111111111111';
const OPERATOR = '33333333-3333-4333-8333-333333333333';

const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((file) => file.endsWith('.sql') && !file.endsWith('.down.sql'))
  .sort()
  .map((file) => readFileSync(join(drizzle, file), 'utf8'));

const databaseUrl = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';

const livePay: PayFiatRampPort = {
  listFiatRails: () => [{ railId: 'pay-fiat-ach', mode: 'live', capabilities: ['onramp', 'offramp'] }],
};

const sandboxPay: PayFiatRampPort = {
  listFiatRails: () => [{ railId: 'card-sandbox', mode: 'sandbox', capabilities: ['onramp', 'offramp'] }],
};

const available = await postgresAvailable(databaseUrl);

if (!available) {
  describe.skip('D26-P1-B4 bank.ramps fiat product doors (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'bank', url: databaseUrl, migrations });
  const sql = db.sql;
  const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-bank' });

  afterAll(async () => {
    await db.drop();
  }, 30_000);

  function principal(userId: string, scopes: Principal['scopes']): Principal {
    return {
      sub: userId,
      userId,
      sid: randomUUID(),
      scopes,
      tier: 'full',
      mfa: true,
      expiresAt: new Date(Date.now() + 60_000),
    } as Principal;
  }

  function signedCaller(bank: ReturnType<typeof createBankServices>, actor: Principal) {
    const raw = encodePrincipal(actor);
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

  describe('D26-P1-B4 bank.ramps fiat public doors — pay adapters, ledger-only', () => {
    let ledger: MemoryLedger;

    beforeEach(async () => {
      await sql`TRUNCATE bank.ramp_offramps, bank.ramp_onramps RESTART IDENTITY CASCADE`;
      ledger = new MemoryLedger();
    });

    it('names fiatVia on the programme door without inventing a bank PSP', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        ramps: { programme: CRYPTO_LEDGER_PROGRAMME, payFiat: livePay },
      });
      const programme = await signedCaller(bank, principal(HOLDER, ['bank:read'])).ramps.programme();
      expect(programme).toMatchObject({
        simulated: true,
        fiatLeg: 'socket.psp-partners',
        fiatVia: 'svc-pay.RailAdapter',
      });
    });

    it('ramps.fiatSettle public door refuses when no pay adapter can settle fiat', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        ramps: { programme: CRYPTO_LEDGER_PROGRAMME },
      });
      await expect(signedCaller(bank, principal(HOLDER, ['bank:read'])).ramps.fiatSettle()).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        cause: { code: 'bank.fiat_ramp_no_pay_adapter' },
      });
    });

    it('ramps.fiatSettle refuses in-repo sandbox/absent pay adapters', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        ramps: { programme: CRYPTO_LEDGER_PROGRAMME, payFiat: inRepoPayFiatRampPort },
      });
      await expect(signedCaller(bank, principal(HOLDER, ['bank:read'])).ramps.fiatSettle()).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        cause: { code: 'bank.fiat_ramp_no_pay_adapter' },
      });
    });

    it('refuses fiat through ops.creditOnramp when no live pay adapter is injected', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        ramps: { programme: CRYPTO_LEDGER_PROGRAMME },
      });
      const ops = signedCaller(bank, principal(OPERATOR, ['admin:treasury']));
      await expect(
        ops.ops.creditOnramp({
          userId: HOLDER,
          assetId: 'USDT',
          amount: '10',
          kind: 'fiat',
          railRef: `empty-${randomUUID()}`,
        }),
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        cause: { code: 'bank.fiat_ramp_no_pay_adapter' },
      });
      const count = await sql`SELECT count(*)::int AS n FROM bank.ramp_onramps`;
      expect(count[0]!.n).toBe(0);
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('sandbox pay rails still refuse fiat through the public door', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        ramps: { programme: CRYPTO_LEDGER_PROGRAMME, payFiat: sandboxPay },
      });
      const ops = signedCaller(bank, principal(OPERATOR, ['admin:treasury']));
      await expect(
        ops.ops.creditOnramp({
          userId: HOLDER,
          assetId: 'USDT',
          amount: '10',
          kind: 'fiat',
          railRef: `sandbox-${randomUUID()}`,
        }),
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        cause: { code: 'bank.fiat_ramp_no_pay_adapter' },
      });
      const count = await sql`SELECT count(*)::int AS n FROM bank.ramp_onramps`;
      expect(count[0]!.n).toBe(0);
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('credits fiat on-ramp through ops door onto the pay rail id — no second book', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        ramps: { programme: CRYPTO_LEDGER_PROGRAMME, payFiat: livePay },
      });
      const ops = signedCaller(bank, principal(OPERATOR, ['admin:treasury']));
      const credited = await ops.ops.creditOnramp({
        userId: HOLDER,
        assetId: 'USDT',
        amount: '25',
        kind: 'fiat',
        railRef: `ach-in-${randomUUID()}`,
      });

      expect(credited).toMatchObject({
        kind: 'fiat',
        rail: 'pay-fiat-ach',
        simulated: true,
        status: 'settled',
        amount: '25',
      });
      expect(typeof credited.amount).toBe('string');
      expect((await ledger.balance(userAvailable(HOLDER, 'USDT'))).amount).toBe(amt('25'));
      expect((await ledger.balance(railBoundary('pay-fiat-ach', 'USDT'))).amount).toBe(amt('-25'));
      // Crypto ledger rail must not absorb fiat — that would be a second book path.
      expect((await ledger.balance(railBoundary('bank-crypto-ledger', 'USDT'))).amount).toBe(amt('0'));
      expect(ledger.reconcile()).toEqual({ ok: true });
      // Same decimal in, same decimal out — no invented FX mark.
      expect(credited.amount).toBe('25');
    });

    it('settles fiat off-ramp through user ramps.offramp onto the same pay rail', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        ramps: { programme: CRYPTO_LEDGER_PROGRAMME, payFiat: livePay },
      });
      const ops = signedCaller(bank, principal(OPERATOR, ['admin:treasury']));
      const user = signedCaller(bank, principal(HOLDER, ['bank:read', 'bank:write']));

      await ops.ops.creditOnramp({
        userId: HOLDER,
        assetId: 'USDT',
        amount: '40',
        kind: 'fiat',
        railRef: `ach-fund-${randomUUID()}`,
      });

      const offrampId = randomUUID();
      const out = await user.ramps.offramp({
        offrampId,
        assetId: 'USDT',
        amount: '15',
        kind: 'fiat',
        destinationRef: 'IBAN-PUBLIC-DOOR',
        clientRef: `fiat-out-${offrampId}`,
      });

      expect(out).toMatchObject({
        kind: 'fiat',
        rail: 'pay-fiat-ach',
        simulated: true,
        status: 'settled',
        amount: '15',
      });
      expect((await ledger.balance(userAvailable(HOLDER, 'USDT'))).amount).toBe(amt('25'));
      expect(ledger.reconcile()).toEqual({ ok: true });

      const listed = await user.ramps.offramps();
      expect(listed.some((row) => row.id === offrampId && row.kind === 'fiat' && row.simulated === true)).toBe(true);
    });

    it('refuses user sessions inventing fiat on-ramp credits', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        ramps: { programme: CRYPTO_LEDGER_PROGRAMME, payFiat: livePay },
      });
      const user = signedCaller(bank, principal(HOLDER, ['bank:read', 'bank:write']));
      await expect(
        user.ops.creditOnramp({
          userId: HOLDER,
          assetId: 'USDT',
          amount: '1',
          kind: 'fiat',
          railRef: `user-try-${randomUUID()}`,
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(ledger.reconcile()).toEqual({ ok: true });
    });
  });
}
