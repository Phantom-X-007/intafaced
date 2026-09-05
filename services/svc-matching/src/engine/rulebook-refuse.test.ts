import { describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { MatchingEngine } from './engine.js';
import { MemoryJournal } from './journal.js';
import { MISSING_OPERATOR } from './halt.js';
import {
  DELIST_POLICY_MISSING,
  MISSING_EVIDENCE,
  PERMISSIONLESS_LISTING,
  installRulebookRefuse,
  type MarketListResult,
} from './rulebook-refuse.js';

installRulebookRefuse();

/**
 * CARD G-rulebook hitch.
 * Emergency halt needs operator+evidence. Delist needs operator+policy.
 * Permissionless listMarket refuses. No invented book.
 */

const MARKET = 'BTC/USDT';

type RulebookEngine = MatchingEngine & {
  listMarket(cmd: {
    readonly marketId?: string | null;
    readonly permissionless?: boolean | null;
    readonly listingPolicy?: string | null;
    readonly listingAuthority?: string | null;
  }): Promise<MarketListResult>;
};

function build() {
  const journal = new MemoryJournal();
  const bus = new MemoryEventBus('svc-matching');
  const engine = new MatchingEngine({ journal, bus, snapshotEvery: 0 }) as RulebookEngine;
  return { journal, bus, engine };
}

describe('rulebook refuse — emergency evidence, delist policy, permissionless listing', () => {
  it('halt without evidence refuses; market not halted', async () => {
    const { journal, engine } = build();
    const halt = await engine.halt(MARKET, { operatorId: 'ops-1' });
    expect(halt.accepted).toBe(false);
    expect(halt.rejected?.code).toBe(MISSING_EVIDENCE);
    expect(halt.rejected?.message).toBe('emergency action requires authority and evidence; the engine does not invent evidence');
    expect(engine.isHalted(MARKET)).toBe(false);
    expect(journal.length).toBe(0);
  });

  it('halt with operator+evidence applies', async () => {
    const { engine } = build();
    const haltCmd = { operatorId: 'ops-1', confirmOperatorId: 'ops-2', evidence: 'incident-42' };
    const halt = await engine.halt(MARKET, haltCmd);
    expect(halt.accepted).toBe(true);
    expect(halt.halted).toBe(true);
    expect(halt.operatorId).toBe('ops-1');
    expect(engine.isHalted(MARKET)).toBe(true);

    const resumeCmd = { operatorId: 'ops-2', confirmOperatorId: 'ops-3', evidenceRefs: ['ref-1'] };
    const resume = await engine.resume(MARKET, resumeCmd);
    expect(resume.accepted).toBe(true);
    expect(engine.isHalted(MARKET)).toBe(false);
  });

  it('delist without policy refuses', async () => {
    const { journal, engine } = build();
    const delisted = await engine.delist(MARKET, { operatorId: 'ops-1' });
    expect(delisted.accepted).toBe(false);
    expect(delisted.rejected?.code).toBe(DELIST_POLICY_MISSING);
    expect(delisted.rejected?.message).toBe('delist requires an owner policy; the engine does not invent a corporate action');
    expect(engine.isDelisted(MARKET)).toBe(false);
    expect(journal.length).toBe(0);
  });

  it('delist with operator+policyId applies', async () => {
    const { engine } = build();
    const delistCmd = { operatorId: 'ops-1', policyId: 'policy-7' };
    const delisted = await engine.delist(MARKET, delistCmd);
    expect(delisted.accepted).toBe(true);
    expect(delisted.delisted).toBe(true);
    expect(engine.isDelisted(MARKET)).toBe(true);
  });

  it('listMarket permissionless refuses; hasMarket false; no invented book', async () => {
    const { journal, engine } = build();
    const listed = await engine.listMarket({ marketId: MARKET, permissionless: true });
    expect(listed.accepted).toBe(false);
    expect(listed.listed).toBe(false);
    expect(listed.rejected?.code).toBe(PERMISSIONLESS_LISTING);
    expect(listed.rejected?.message).toBe('permissionless listings refuse; the engine does not invent a listing');
    expect(engine.hasMarket(MARKET)).toBe(false);
    expect(engine.markets).toEqual([]);
    expect(journal.length).toBe(0);

    const missingPolicy = await engine.listMarket({ marketId: MARKET, listingAuthority: 'ops' });
    expect(missingPolicy.accepted).toBe(false);
    expect(missingPolicy.rejected?.code).toBe(PERMISSIONLESS_LISTING);
    expect(engine.hasMarket(MARKET)).toBe(false);
  });

  it('missing operator still missing_operator', async () => {
    const { engine } = build();
    const haltCmd = { evidence: 'incident-42' };
    const halt = await engine.halt(MARKET, haltCmd);
    expect(halt.accepted).toBe(false);
    expect(halt.rejected?.code).toBe(MISSING_OPERATOR);
    expect(engine.isHalted(MARKET)).toBe(false);

    const delistCmd = { policyId: 'policy-7' };
    const delisted = await engine.delist(MARKET, delistCmd);
    expect(delisted.accepted).toBe(false);
    expect(delisted.rejected?.code).toBe(MISSING_OPERATOR);
    expect(engine.isDelisted(MARKET)).toBe(false);

    const blank = await engine.halt(MARKET, { operatorId: '   ', evidence: 'incident-42' } as { operatorId: string });
    expect(blank.rejected?.code).toBe(MISSING_OPERATOR);
  });
});
