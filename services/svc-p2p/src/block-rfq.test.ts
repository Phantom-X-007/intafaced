/**
 * P2P block/RFQ: firm quote/accept/expire. Not a book fill. Never invent a mid.
 */
import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import type { Principal } from '@intafaced/auth';
import {
  BlockRfqError,
  BlockRfqService,
  RFQ_ALLOCATION_RESIDUAL,
  RFQ_GIVE_UP_RESIDUAL,
  RFQ_UNNAMED_RECEIVING_RESIDUAL,
  acceptBlockQuote,
  expireBlockQuote,
  parseNamedReceivingAccount,
  parseRequiredExpiry,
  parseRequiredPrice,
  parseRequiredSize,
  presentBlockQuote,
} from './block-rfq.js';
import { MemoryBlockQuoteStore } from './block-rfq-store.js';

const MAKER = '11111111-1111-4111-8111-111111111111';
const TAKER = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-08-26T12:00:00.000Z');
const EXPIRY = '2026-08-26T12:05:00.000Z';

const maker = { userId: MAKER } as Principal;
const taker = { userId: TAKER } as Principal;
const stranger = { userId: STRANGER } as Principal;

function service(now = NOW) {
  return new BlockRfqService(new MemoryBlockQuoteStore(), { now: () => now });
}

describe('block/RFQ — missing size/price/expiry refuse', () => {
  it('refuses blank size — never invents quantity', () => {
    for (const raw of ['', '   ', null, undefined] as const) {
      try {
        parseRequiredSize(raw);
        expect.unreachable('must refuse blank size');
      } catch (err) {
        expect(err).toBeInstanceOf(BlockRfqError);
        expect((err as BlockRfqError).code).toBe('p2p.rfq_missing_size');
      }
    }
  });

  it('refuses blank price — never invents a mid', () => {
    for (const raw of ['', '   ', null, undefined] as const) {
      try {
        parseRequiredPrice(raw);
        expect.unreachable('must refuse blank price');
      } catch (err) {
        expect(err).toBeInstanceOf(BlockRfqError);
        expect((err as BlockRfqError).code).toBe('p2p.rfq_missing_price');
      }
    }
  });

  it('refuses blank expiry — never invents a TTL', () => {
    for (const raw of ['', '   ', null, undefined] as const) {
      try {
        parseRequiredExpiry(raw, NOW);
        expect.unreachable('must refuse blank expiry');
      } catch (err) {
        expect(err).toBeInstanceOf(BlockRfqError);
        expect((err as BlockRfqError).code).toBe('p2p.rfq_missing_expiry');
      }
    }
  });
});

describe('block/RFQ — quote / accept / expire', () => {
  it('quotes exact decimal strings and is not a book fill', async () => {
    const quoted = await service().quote(maker, {
      takerId: TAKER,
      side: 'sell',
      asset: 'USDT',
      fiatCurrency: 'USD',
      size: '100.50',
      price: '1.02',
      expiresAt: EXPIRY,
    });
    expect(quoted.size).toBe('100.5');
    expect(quoted.price).toBe('1.02');
    expect(quoted.notional).toBe('102.51');
    expect(quoted.lifecycle).toBe('open');
    expect(quoted.bookFill).toBe(false);
    expect(quoted.midInvented).toBe(false);
    expect(quoted.expiresAt).toBe(new Date(EXPIRY).toISOString());
  });

  it('accept binds the quoted price — last look on a different price refuses', async () => {
    const svc = service();
    const quoted = await svc.quote(maker, {
      takerId: TAKER,
      side: 'sell',
      asset: 'USDT',
      fiatCurrency: 'USD',
      size: '10',
      price: '1.05',
      expiresAt: EXPIRY,
    });
    await expect(svc.accept(taker, { quoteId: quoted.quoteId, assertedPrice: '1.04' })).rejects.toMatchObject({
      code: 'p2p.rfq_last_look_forbidden',
    });
    const bound = await svc.accept(taker, { quoteId: quoted.quoteId, assertedPrice: '1.05' });
    expect(bound.lifecycle).toBe('bound');
    expect(bound.fillPrice).toBe('1.05');
    expect(bound.bookFill).toBe(false);
    const again = await svc.accept(taker, { quoteId: quoted.quoteId });
    expect(again.acceptedAt).toBe(bound.acceptedAt);
  });

  it('clock-expired accept refuses rather than requote', async () => {
    const store = new MemoryBlockQuoteStore();
    const open = new BlockRfqService(store, { now: () => NOW });
    const quoted = await open.quote(maker, {
      takerId: TAKER,
      side: 'buy',
      asset: 'USDT',
      fiatCurrency: 'USD',
      size: '5',
      price: '1',
      expiresAt: EXPIRY,
    });
    const later = new BlockRfqService(store, { now: () => new Date('2026-08-26T12:06:00.000Z') });
    await expect(later.accept(taker, { quoteId: quoted.quoteId })).rejects.toMatchObject({ code: 'p2p.rfq_expired' });
  });

  it('expire then accept refuses — not a book fill and not a requote', async () => {
    const svc = service();
    const quoted = await svc.quote(maker, {
      takerId: TAKER,
      side: 'sell',
      asset: 'USDT',
      fiatCurrency: 'USD',
      size: '8',
      price: '1.01',
      expiresAt: EXPIRY,
    });
    const expired = await svc.expire(maker, { quoteId: quoted.quoteId });
    expect(expired.lifecycle).toBe('expired');
    expect(expired.bookFill).toBe(false);
    await expect(svc.accept(taker, { quoteId: quoted.quoteId })).rejects.toMatchObject({ code: 'p2p.rfq_expired' });
  });

  it('stranger cannot accept; maker cannot accept their own quote', async () => {
    const svc = service();
    const quoted = await svc.quote(maker, {
      takerId: TAKER,
      side: 'sell',
      asset: 'USDT',
      fiatCurrency: 'USD',
      size: '1',
      price: '1',
      expiresAt: EXPIRY,
    });
    await expect(svc.accept(stranger, { quoteId: quoted.quoteId })).rejects.toMatchObject({ code: 'p2p.rfq_not_a_party' });
    await expect(svc.accept(maker, { quoteId: quoted.quoteId })).rejects.toMatchObject({ code: 'p2p.rfq_not_a_party' });
  });

  it('self-quote refuses', async () => {
    await expect(
      service().quote(maker, {
        takerId: MAKER,
        side: 'sell',
        asset: 'USDT',
        fiatCurrency: 'USD',
        size: '1',
        price: '1',
        expiresAt: EXPIRY,
      }),
    ).rejects.toMatchObject({ code: 'p2p.rfq_self_trade' });
  });

  it('bound quote cannot expire into a book unwind', async () => {
    const quote = {
      quoteId: 'q',
      makerId: MAKER,
      takerId: TAKER,
      side: 'sell' as const,
      asset: 'USDT',
      fiatCurrency: 'USD',
      size: parseAmount('1'),
      price: parseAmount('1'),
      notional: parseAmount('1'),
      createdAt: NOW.toISOString(),
      expiresAt: EXPIRY,
      lifecycle: 'bound' as const,
      acceptedAt: NOW.toISOString(),
      fillPrice: parseAmount('1'),
      bookFill: false as const,
    };
    expect(() => expireBlockQuote({ quote, now: NOW })).toThrow(BlockRfqError);
    expect(presentBlockQuote(acceptBlockQuote({ quote, now: NOW })).bookFill).toBe(false);
  });
});

describe('block/RFQ — unnamed receiving account refuses', () => {
  it('blank receiving account refuses — never invents maker, taker, house or omnibus', () => {
    for (const raw of ['', '   ', null, undefined] as const) {
      try {
        parseNamedReceivingAccount(raw);
        expect.unreachable('must refuse unnamed receiving account');
      } catch (err) {
        expect(err).toBeInstanceOf(BlockRfqError);
        expect((err as BlockRfqError).code).toBe('p2p.rfq_unnamed_receiving_account');
        expect((err as BlockRfqError).residual).toBe(RFQ_UNNAMED_RECEIVING_RESIDUAL);
      }
    }
  });

  it('allocate without a named receiving account refuses — never invents a destination', () => {
    const svc = service();
    for (const input of [
      { quoteId: '00000000-0000-4000-8000-000000000001' },
      { quoteId: '00000000-0000-4000-8000-000000000001', allocations: [] },
      { quoteId: '00000000-0000-4000-8000-000000000001', allocations: [{ receivingAccount: '   ' }] },
      { quoteId: '00000000-0000-4000-8000-000000000001', allocations: [{ receivingAccount: null }] },
    ] as const) {
      try {
        svc.allocate(taker, input);
        expect.unreachable('must refuse unnamed allocation');
      } catch (err) {
        expect(err).toBeInstanceOf(BlockRfqError);
        expect((err as BlockRfqError).code).toBe('p2p.rfq_unnamed_receiving_account');
        expect((err as BlockRfqError).residual).toBe(RFQ_UNNAMED_RECEIVING_RESIDUAL);
      }
    }
  });

  it('give-up without a named receiving account refuses — never invents a carrying plug', () => {
    const svc = service();
    for (const receivingAccount of [undefined, '', '   ', null] as const) {
      try {
        svc.giveUp(taker, { quoteId: '00000000-0000-4000-8000-000000000001', receivingAccount });
        expect.unreachable('must refuse unnamed give-up');
      } catch (err) {
        expect(err).toBeInstanceOf(BlockRfqError);
        expect((err as BlockRfqError).code).toBe('p2p.rfq_unnamed_receiving_account');
        expect((err as BlockRfqError).residual).toBe(RFQ_UNNAMED_RECEIVING_RESIDUAL);
      }
    }
  });
});

describe('block/RFQ — allocation / give-up refuse-closed', () => {
  it('named allocation still refuses — never invents a split', async () => {
    const svc = service();
    const quoted = await svc.quote(maker, {
      takerId: TAKER,
      side: 'sell',
      asset: 'USDT',
      fiatCurrency: 'USD',
      size: '1',
      price: '1',
      expiresAt: EXPIRY,
    });
    try {
      svc.allocate(taker, {
        quoteId: quoted.quoteId,
        allocations: [{ receivingAccount: 'fund-a' }],
      });
      expect.unreachable('must refuse allocation');
    } catch (err) {
      expect(err).toBeInstanceOf(BlockRfqError);
      expect((err as BlockRfqError).code).toBe('p2p.rfq_allocation_refused');
      expect((err as BlockRfqError).residual).toBe(RFQ_ALLOCATION_RESIDUAL);
    }
  });

  it('named give-up still refuses — never invents a clearing map', () => {
    const svc = service();
    try {
      svc.giveUp(taker, {
        quoteId: '00000000-0000-4000-8000-000000000001',
        receivingAccount: 'carrying-1',
      });
      expect.unreachable('must refuse give-up');
    } catch (err) {
      expect(err).toBeInstanceOf(BlockRfqError);
      expect((err as BlockRfqError).code).toBe('p2p.rfq_give_up_refused');
      expect((err as BlockRfqError).residual).toBe(RFQ_GIVE_UP_RESIDUAL);
    }
  });
});
