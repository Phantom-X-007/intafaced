import { describe, expect, it } from 'vitest';
import { ALL_STATUSES, actionsFor, custodyOf, describeStatus, isLive, isSettlementPending, roleOf } from './desk';
import { otcTradeSchema, type OtcTrade, type OtcTradeStatus, type OtcResolution } from '../api/wire';

/**
 * The desk's presentation logic, tested by enumeration over every state.
 *
 * The tests that matter most are the ones about what is NOT offered: a buyer
 * shown a release button, or a seller shown no way out of an escrowed trade,
 * are both how a user ends up believing their funds are gone.
 */

const BUYER = '11111111-1111-4111-8111-111111111111';
const SELLER = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';

function trade(status: OtcTradeStatus, overrides: Partial<OtcTrade> = {}): OtcTrade {
  const resolution: OtcResolution | null =
    overrides.resolution !== undefined ? overrides.resolution : status === 'released' ? 'released' : status === 'cancelled' ? 'refunded' : null;

  return {
    id: '44444444-4444-4444-8444-444444444444',
    offerId: '55555555-5555-4555-8555-555555555555',
    sellerId: SELLER,
    buyerId: BUYER,
    asset: 'USDT',
    amount: '250.5',
    fiatCurrency: 'GBP',
    fiatAmount: '198.40',
    price: '0.792',
    method: 'faster-payments',
    status,
    resolution,
    deadlineAt: isLive(status) ? '2026-07-29T12:00:00.000Z' : null,
    createdAt: '2026-07-29T11:00:00.000Z',
    escrowedAt: status === 'created' ? null : '2026-07-29T11:00:05.000Z',
    resolvedAt: isLive(status) ? null : '2026-07-29T11:30:00.000Z',
    settledAt: isLive(status) ? null : '2026-07-29T11:30:01.000Z',
    ...overrides,
  };
}

describe('the fixture is a shape svc-p2p could actually return', () => {
  it.each(ALL_STATUSES)('%s parses against the wire schema', (status) => {
    expect(otcTradeSchema.safeParse(trade(status)).success).toBe(true);
  });
});

describe('roleOf', () => {
  it('identifies each side', () => {
    expect(roleOf(trade('escrowed'), BUYER)).toBe('buyer');
    expect(roleOf(trade('escrowed'), SELLER)).toBe('seller');
  });

  it('gives a stranger and an anonymous session no role at all', () => {
    expect(roleOf(trade('escrowed'), STRANGER)).toBeNull();
    expect(roleOf(trade('escrowed'), null)).toBeNull();
  });
});

describe('custodyOf — the stranded-funds answer, for every state', () => {
  it('is total over the status enum and always says something', () => {
    for (const status of ALL_STATUSES) {
      const fact = custodyOf(trade(status));
      expect(fact.where.length).toBeGreaterThan(0);
      // The load-bearing half: every state answers "what if nobody acts".
      expect(fact.ifNobodyActs.length).toBeGreaterThan(0);
    }
  });

  it('reports value in escrow for exactly the states that hold it', () => {
    const holding = ALL_STATUSES.filter((s) => custodyOf(trade(s)).custody === 'in-escrow');
    // Mirrors ESCROW_HOLDING_STATUSES in services/svc-p2p/src/state.ts.
    expect([...holding].sort()).toEqual(['disputed', 'escrowed', 'fiat_sent']);
  });

  it('says nothing has moved while the escrow lock is still in flight', () => {
    expect(custodyOf(trade('created')).custody).toBe('with-seller');
  });

  it('never promises an auto-release out of fiat_sent', () => {
    const fact = custodyOf(trade('fiat_sent'));
    expect(fact.ifNobodyActs).toContain('dispute');
    expect(fact.ifNobodyActs).toContain('never auto-released');
  });

  it('distinguishes a refunded cancellation from one that locked nothing', () => {
    expect(custodyOf(trade('cancelled', { resolution: 'refunded' })).custody).toBe('returned');
    expect(custodyOf(trade('cancelled', { resolution: 'voided' })).custody).toBe('with-seller');
  });

  it('reports delivery only in the released state', () => {
    const delivered = ALL_STATUSES.filter((s) => custodyOf(trade(s)).custody === 'delivered');
    expect(delivered).toEqual(['released']);
  });
});

describe('isSettlementPending — funds late, not stranded', () => {
  it('is true between a recorded resolution and its ledger post', () => {
    expect(isSettlementPending(trade('released', { resolvedAt: '2026-07-29T11:30:00.000Z', settledAt: null }))).toBe(true);
  });

  it('is false once settled, and false while still live', () => {
    expect(isSettlementPending(trade('released'))).toBe(false);
    expect(isSettlementPending(trade('escrowed'))).toBe(false);
  });
});

describe('actionsFor', () => {
  it('offers a non-party nothing, in every state', () => {
    for (const status of ALL_STATUSES) {
      expect(actionsFor(trade(status), null)).toEqual([]);
    }
  });

  it('offers nothing in a terminal state, to either party', () => {
    for (const status of ['released', 'cancelled'] as const) {
      expect(actionsFor(trade(status), 'buyer')).toEqual([]);
      expect(actionsFor(trade(status), 'seller')).toEqual([]);
    }
  });

  it('offers nothing while the escrow lock is in flight — the sweeper owns `created`', () => {
    expect(actionsFor(trade('created'), 'buyer')).toEqual([]);
    expect(actionsFor(trade('created'), 'seller')).toEqual([]);
  });

  it('never offers the buyer a release, in any state', () => {
    for (const status of ALL_STATUSES) {
      const actions = actionsFor(trade(status), 'buyer').map((a) => a.action);
      expect(actions).not.toContain('confirmReceived');
    }
  });

  it('never offers the seller the buyer’s "I have paid"', () => {
    for (const status of ALL_STATUSES) {
      const actions = actionsFor(trade(status), 'seller').map((a) => a.action);
      expect(actions).not.toContain('markFiatSent');
    }
  });

  it('gives an escrowed buyer a way to declare payment and a way out', () => {
    const actions = actionsFor(trade('escrowed'), 'buyer').map((a) => a.action);
    expect(actions).toContain('markFiatSent');
    expect(actions).toContain('cancel');
    expect(actions).toContain('openDispute');
  });

  it('gives an escrowed seller release, refund and escalation', () => {
    const actions = actionsFor(trade('escrowed'), 'seller').map((a) => a.action);
    expect(actions).toContain('confirmReceived');
    expect(actions).toContain('cancel');
  });

  it('does not let a buyer who declared payment cancel it away', () => {
    // svc-p2p rejects this; not offering it stops the user learning that the
    // hard way, having already sent the fiat.
    const actions = actionsFor(trade('fiat_sent'), 'buyer').map((a) => a.action);
    expect(actions).not.toContain('cancel');
    expect(actions).toEqual(['openDispute']);
  });

  it('leaves a seller able to release after the buyer declares payment', () => {
    expect(actionsFor(trade('fiat_sent'), 'seller').map((a) => a.action)).toContain('confirmReceived');
  });

  it('offers no party action in a dispute — a moderator rules', () => {
    expect(actionsFor(trade('disputed'), 'buyer')).toEqual([]);
    expect(actionsFor(trade('disputed'), 'seller')).toEqual([]);
  });

  it('gives every party in a live, non-created state a route to a moderator', () => {
    for (const status of ['escrowed', 'fiat_sent'] as const) {
      for (const role of ['buyer', 'seller'] as const) {
        expect(actionsFor(trade(status), role).map((a) => a.action)).toContain('openDispute');
      }
    }
  });

  it('states a consequence on every offered action, and flags the irreversible ones', () => {
    for (const status of ALL_STATUSES) {
      for (const role of ['buyer', 'seller'] as const) {
        for (const offer of actionsFor(trade(status), role)) {
          expect(offer.consequence.length).toBeGreaterThan(0);
          expect(offer.label.length).toBeGreaterThan(0);
        }
      }
    }
    // Releasing and refunding move value; declaring payment and escalating do not.
    const seller = actionsFor(trade('escrowed'), 'seller');
    expect(seller.find((a) => a.action === 'confirmReceived')?.irreversible).toBe(true);
    expect(seller.find((a) => a.action === 'openDispute')?.irreversible).toBe(false);
  });

  it('names the amount and asset in every value-moving consequence', () => {
    const t = trade('escrowed');
    for (const role of ['buyer', 'seller'] as const) {
      for (const offer of actionsFor(t, role).filter((a) => a.irreversible)) {
        expect(offer.consequence).toContain(t.amount);
        expect(offer.consequence).toContain(t.asset);
      }
    }
  });
});

describe('describeStatus / isLive', () => {
  it('describes every status', () => {
    for (const status of ALL_STATUSES) {
      expect(describeStatus(trade(status)).length).toBeGreaterThan(0);
    }
  });

  it('separates a refunded cancellation from a void in the label', () => {
    expect(describeStatus(trade('cancelled', { resolution: 'refunded' }))).toContain('refunded');
    expect(describeStatus(trade('cancelled', { resolution: 'voided' }))).toContain('nothing was locked');
  });

  it('treats exactly the two terminal states as not live', () => {
    expect(ALL_STATUSES.filter((s) => !isLive(s))).toEqual(['released', 'cancelled']);
  });
});
