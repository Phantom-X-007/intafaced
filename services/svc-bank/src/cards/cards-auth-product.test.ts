/**
 * D26-P1-B2 — bank.cards auth path proven or honest; ledger half reachable.
 *
 * Breaks caught:
 *   · a tested CardService that nobody can reach through the mounted router
 *     (composition root / scope / issuer wiring regression);
 *   · a deployment that invents a live BIN / issuer setting outside the closed
 *     none|card-sim set;
 *   · a module kill that stops issue but still lets authorise post a hold;
 *   · reading the tracker "<2s auth decision" title as a card-sim SLA instead of
 *     a live-rail budget (socket.live-issuer).
 *
 * Enters through createBankRouter + signed createEdgeContext. Value moves only
 * through imported ledger-client recipes on MemoryLedger. No CardService calls.
 */
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { MemoryLedger, parseAmount as amt, recipes, userAvailable } from '@intafaced/ledger-client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { memoryLedgerHistory } from '../analytics/ledger-history.js';
import { createBankServices } from '../bank-service.js';
import { createBankRouter } from '../router.js';
import { CARD_ISSUER_SETTINGS, LIVE_ISSUER_AUTH_DECISION_BUDGET_MS, cardIssuerFor, noCardIssuer } from './issuer.js';

const SECRET = 'bank-cards-auth-product-boundary-secret-32';
const HOLDER = '11111111-1111-4111-8111-111111111111';
const OPERATOR = '33333333-3333-4333-8333-333333333333';

const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((file) => file.endsWith('.sql') && !file.endsWith('.down.sql'))
  .sort()
  .map((file) => readFileSync(join(drizzle, file), 'utf8'));

const databaseUrl = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';

describe('D26-P1-B2 issuer surface stays closed — no invented BIN/programme', () => {
  it('offers exactly none and card-sim; silence maps to the refusing adapter', () => {
    expect([...CARD_ISSUER_SETTINGS]).toEqual(['none', 'card-sim']);
    expect(cardIssuerFor('none')).toBe(noCardIssuer);
    expect(cardIssuerFor('none').programme.simulated).toBe(true);
    expect(cardIssuerFor('card-sim').programme).toMatchObject({
      id: 'card-sim',
      simulated: true,
    });
    expect(cardIssuerFor('card-sim').programme.displayName.toLowerCase()).toContain('simulated');
  });

  it('names the live-rail auth budget without pretending card-sim is that rail', () => {
    expect(LIVE_ISSUER_AUTH_DECISION_BUDGET_MS).toBe(2_000);
  });
});

const available = await postgresAvailable(databaseUrl);

if (!available) {
  describe.skip('D26-P1-B2 bank.cards auth product boundary (Postgres unavailable)', () => {
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

  async function fund(ledger: MemoryLedger, userId: string, value: string) {
    await ledger.post(
      recipes.deposit({
        userId,
        assetId: 'USDT',
        amount: amt(value),
        rail: 'test',
        railRef: `${userId}:${randomUUID()}`,
      }),
    );
  }

  describe('mounted card doors — ledger half reachable, auth proven or honest', () => {
    let ledger: MemoryLedger;

    beforeEach(async () => {
      await sql`
        TRUNCATE bank.card_cashback, bank.card_settlements, bank.card_conversions,
                 bank.card_authorizations, bank.cards
        RESTART IDENTITY CASCADE
      `;
      ledger = new MemoryLedger();
    });

    it('composition root with no cards option still has no programme (never falls back to card-sim)', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger));
      const programme = await signedCaller(bank, principal(HOLDER, ['bank:read'])).cards.programme();
      expect(programme).toEqual({ id: 'none', simulated: true, displayName: 'No card programme' });
      await expect(
        signedCaller(bank, principal(HOLDER, ['bank:read', 'bank:write'])).cards.issue({
          cardId: randomUUID(),
          assetId: 'USDT',
          perAuthorizationLimit: '100',
        }),
      ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', cause: { code: 'bank.no_card_issuer' } });
    });

    it('issues, authorises and holds through the router under the live budget, always simulated', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        cards: { issuer: cardIssuerFor('card-sim') },
      });
      await fund(ledger, HOLDER, '500');

      const user = signedCaller(bank, principal(HOLDER, ['bank:read', 'bank:write']));
      const card = await user.cards.issue({
        cardId: randomUUID(),
        assetId: 'USDT',
        cashbackBps: 0,
        perAuthorizationLimit: '250',
      });
      expect(card.simulated).toBe(true);
      expect(card.issuer).toBe('card-sim');
      expect(typeof card.perAuthorizationLimit).toBe('string');

      const ops = signedCaller(bank, principal(OPERATOR, ['admin:treasury']));
      const authorizationRef = `auth-${randomUUID()}`;
      const started = performance.now();
      const authorized = await ops.ops.cardAuthorize({
        cardId: card.id,
        authorizationRef,
        amount: '80',
      });
      const elapsedMs = performance.now() - started;

      expect(authorized.decision).toBe('approved');
      expect(authorized.amount).toBe('80');
      expect(typeof authorized.amount).toBe('string');
      // Ledger-half proof only: the book is not the bottleneck. This is not a
      // live BIN / scheme SLA — programme stays simulated.
      expect(elapsedMs).toBeLessThan(LIVE_ISSUER_AUTH_DECISION_BUDGET_MS);
      expect((await user.cards.programme()).simulated).toBe(true);
      expect((await ledger.balance(userAvailable(HOLDER, 'USDT'))).amount).toBe(amt('420'));
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('carries a named insufficient-funds decline through the public door and moves nothing', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        cards: { issuer: cardIssuerFor('card-sim') },
      });
      await fund(ledger, HOLDER, '10');

      const user = signedCaller(bank, principal(HOLDER, ['bank:read', 'bank:write']));
      const card = await user.cards.issue({
        cardId: randomUUID(),
        assetId: 'USDT',
        perAuthorizationLimit: '250',
      });

      const ops = signedCaller(bank, principal(OPERATOR, ['admin:treasury']));
      const declined = await ops.ops.cardAuthorize({
        cardId: card.id,
        authorizationRef: `auth-${randomUUID()}`,
        amount: '80',
      });

      expect(declined.decision).toBe('declined');
      expect(declined.declineCode).toBe('ledger.insufficient_funds');
      expect((await ledger.balance(userAvailable(HOLDER, 'USDT'))).amount).toBe(amt('10'));
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('module kill refuses issue and authorise through the router before any hold', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        cards: { issuer: cardIssuerFor('card-sim'), moduleEnabled: false },
      });
      await fund(ledger, HOLDER, '500');

      const user = signedCaller(bank, principal(HOLDER, ['bank:read', 'bank:write']));
      await expect(
        user.cards.issue({
          cardId: randomUUID(),
          assetId: 'USDT',
          perAuthorizationLimit: '100',
        }),
      ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', cause: { code: 'bank.cards_disabled' } });

      // A card that somehow already existed must still refuse authorise — the
      // kill is not issue-only theatre.
      const armed = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        cards: { issuer: cardIssuerFor('card-sim'), moduleEnabled: true },
      });
      const issued = await signedCaller(armed, principal(HOLDER, ['bank:read', 'bank:write'])).cards.issue({
        cardId: randomUUID(),
        assetId: 'USDT',
        perAuthorizationLimit: '100',
      });
      const killed = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        cards: { issuer: cardIssuerFor('card-sim'), moduleEnabled: false },
      });
      await expect(
        signedCaller(killed, principal(OPERATOR, ['admin:treasury'])).ops.cardAuthorize({
          cardId: issued.id,
          authorizationRef: `auth-${randomUUID()}`,
          amount: '10',
        }),
      ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', cause: { code: 'bank.cards_disabled' } });
      expect((await ledger.balance(userAvailable(HOLDER, 'USDT'))).amount).toBe(amt('500'));
      expect(ledger.reconcile()).toEqual({ ok: true });
    });

    it('refuses user sessions on the authorisation ops door', async () => {
      const bank = createBankServices(sql, ledger, memoryLedgerHistory(ledger), {
        cards: { issuer: cardIssuerFor('card-sim') },
      });
      await fund(ledger, HOLDER, '500');
      const user = signedCaller(bank, principal(HOLDER, ['bank:read', 'bank:write']));
      const card = await user.cards.issue({
        cardId: randomUUID(),
        assetId: 'USDT',
        perAuthorizationLimit: '100',
      });
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (user as any).ops.cardAuthorize({
          cardId: card.id,
          authorizationRef: `auth-${randomUUID()}`,
          amount: '10',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
}
