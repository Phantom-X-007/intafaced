import { describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { parseAmount } from '@intafaced/ledger-client/money';
import { MatchingEngine } from './engine.js';
import { MemoryJournal } from './journal.js';
import './halt-law.js';
import {
  DELIST_POLICY_MISSING,
  MISSING_EVIDENCE,
  PERMISSIONLESS_LISTING,
  installRulebookRefuse,
} from './rulebook-refuse.js';
import type { EngineOrder } from './types.js';

installRulebookRefuse();

const MARKET = 'BTC-USDT';
const OP = 'op-1';
const BUY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function engine(): MatchingEngine {
  return new MatchingEngine({
    journal: new MemoryJournal(),
    bus: new MemoryEventBus('svc-matching'),
    snapshotEvery: 0,
  });
}

function limitBuy(): EngineOrder {
  return {
    orderId: BUY,
    accountId: 'desk',
    type: 'limit',
    side: 'buy',
    qty: parseAmount('1'),
    price: parseAmount('100'),
    stopPrice: null,
    tif: 'GTC',
  };
}

describe('rulebook refuse — emergency evidence, delist policy, permissionless listing', () => {
  it('halt without evidence refuses — market is not halted; submits still rest', async () => {
    const live = engine();
    const halted = await live.halt(MARKET, { operatorId: OP });
    expect(halted.accepted).toBe(false);
    expect(halted.rejected?.code).toBe(MISSING_EVIDENCE);
    expect(live.isHalted(MARKET)).toBe(false);
    const placed = await live.submit(MARKET, limitBuy());
    expect(placed.accepted).toBe(true);
    expect(placed.resting?.orderId).toBe(BUY);
    expect(typeof limitBuy().qty).toBe('bigint');
  });

  it('halt with operator and evidence applies', async () => {
    const live = engine();
    const halted = await live.halt(MARKET, { operatorId: OP, evidence: 'incident-17' });
    expect(halted.accepted).toBe(true);
    expect(live.isHalted(MARKET)).toBe(true);
    const placed = await live.submit(MARKET, limitBuy());
    expect(placed.accepted).toBe(false);
  });

  it('missing operator still missing_operator', async () => {
    const live = engine();
    const halted = await live.halt(MARKET, { evidence: 'incident-17' });
    expect(halted.accepted).toBe(false);
    expect(halted.rejected?.code).toBe('missing_operator');
    expect(live.isHalted(MARKET)).toBe(false);
  });

  it('delist without policy refuses — market is not delisted', async () => {
    const live = engine();
    const delisted = await live.delist(MARKET, { operatorId: OP });
    expect(delisted.accepted).toBe(false);
    expect(delisted.rejected?.code).toBe(DELIST_POLICY_MISSING);
    expect(live.isDelisted(MARKET)).toBe(false);
  });

  it('delist with operator and policyId applies', async () => {
    const live = engine();
    const delisted = await live.delist(MARKET, { operatorId: OP, policyId: 'corp.delist.v1' });
    expect(delisted.accepted).toBe(true);
    expect(live.isDelisted(MARKET)).toBe(true);
  });

  it('permissionless listMarket refuses — no invented book', async () => {
    const live = engine();
    const listed = await (
      live as MatchingEngine & {
        listMarket: (cmd: {
          marketId: string;
          permissionless?: boolean;
          listingPolicy?: string;
        }) => Promise<{ accepted: boolean; listed: boolean; rejected?: { code: string } }>;
      }
    ).listMarket({ marketId: MARKET, permissionless: true });
    expect(listed.accepted).toBe(false);
    expect(listed.rejected?.code).toBe(PERMISSIONLESS_LISTING);
    expect(listed.listed).toBe(false);
    expect(live.hasMarket(MARKET)).toBe(false);
  });

  it('listMarket without listingPolicy refuses — engine does not invent a listing', async () => {
    const live = engine();
    const listed = await (
      live as MatchingEngine & {
        listMarket: (cmd: { marketId: string }) => Promise<{ accepted: boolean; listed: boolean; rejected?: { code: string } }>;
      }
    ).listMarket({ marketId: MARKET });
    expect(listed.accepted).toBe(false);
    expect(listed.rejected?.code).toBe(PERMISSIONLESS_LISTING);
    expect(live.hasMarket(MARKET)).toBe(false);
  });
});
