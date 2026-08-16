import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_NOT_FOUND_CODE,
  CHAIN_LEG_REFUSED_CODE,
  FundraisingError,
  MemoryFundraisingRegistry,
  RAISE_ECONOMICS_UNSET_CODE,
  isSetRaiseAmount,
} from './fundraising.js';

const OWNER = '11111111-1111-4111-8111-111111111111';

describe('isSetRaiseAmount — D26-P0-13 no invent cap or price', () => {
  it('treats missing, blank, and zero as unset', () => {
    expect(isSetRaiseAmount(undefined)).toBe(false);
    expect(isSetRaiseAmount(null)).toBe(false);
    expect(isSetRaiseAmount('')).toBe(false);
    expect(isSetRaiseAmount('   ')).toBe(false);
    expect(isSetRaiseAmount('0')).toBe(false);
    expect(isSetRaiseAmount('0.00')).toBe(false);
  });

  it('accepts a caller-supplied positive decimal string', () => {
    expect(isSetRaiseAmount('1000000')).toBe(true);
    expect(isSetRaiseAmount('0.01')).toBe(true);
  });
});

describe('createCampaign — refuse unset raise economics', () => {
  it('refuses when cap is unset even if price is present', () => {
    const reg = new MemoryFundraisingRegistry();
    const result = reg.createCampaign({ ownerUserId: OWNER, name: 'Seed', price: '1.00' });
    expect(result).toEqual({
      ok: false,
      code: RAISE_ECONOMICS_UNSET_CODE,
      reason: 'unset',
    });
  });

  it('refuses when price is unset even if cap is present', () => {
    const reg = new MemoryFundraisingRegistry();
    const result = reg.createCampaign({ ownerUserId: OWNER, name: 'Seed', cap: '1000' });
    expect(result).toEqual({
      ok: false,
      code: RAISE_ECONOMICS_UNSET_CODE,
      reason: 'unset',
    });
  });

  it('does not invent a default cap or price on a bare name', () => {
    const reg = new MemoryFundraisingRegistry();
    const result = reg.createCampaign({ ownerUserId: OWNER, name: 'Seed' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(RAISE_ECONOMICS_UNSET_CODE);
  });

  it('records caller-supplied cap and price without rewriting them', () => {
    const reg = new MemoryFundraisingRegistry();
    const result = reg.createCampaign({
      ownerUserId: OWNER,
      name: 'Seed',
      cap: '250000.50',
      price: '1.25',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.campaign.cap).toBe('250000.50');
      expect(result.campaign.price).toBe('1.25');
    }
  });
});

describe('addMilestone — off-chain only', () => {
  it('stores a title with no chain fields', () => {
    const reg = new MemoryFundraisingRegistry();
    const created = reg.createCampaign({
      ownerUserId: OWNER,
      name: 'Seed',
      cap: '1000',
      price: '1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const ms = reg.addMilestone({ campaignId: created.campaign.id, title: 'Legal close' });
    expect(ms.title).toBe('Legal close');
    expect(ms).not.toHaveProperty('chainTx');
    expect(ms).not.toHaveProperty('escrowAddress');
  });

  it('refuses a chain escrow/vesting attachment rather than dropping it', () => {
    const reg = new MemoryFundraisingRegistry();
    const created = reg.createCampaign({
      ownerUserId: OWNER,
      name: 'Seed',
      cap: '1000',
      price: '1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(() =>
      reg.addMilestone({
        campaignId: created.campaign.id,
        title: 'Escrow',
        escrowAddress: '0xabc',
      }),
    ).toThrow(FundraisingError);
    try {
      reg.addMilestone({
        campaignId: created.campaign.id,
        title: 'Escrow',
        vestingContract: '0xdef',
      });
    } catch (err) {
      expect(err).toBeInstanceOf(FundraisingError);
      if (err instanceof FundraisingError) expect(err.code).toBe(CHAIN_LEG_REFUSED_CODE);
    }
  });
});

describe('listInvestors — empty list is not a fake raise', () => {
  it('returns an empty investor list with committedAmount derived as 0', () => {
    const reg = new MemoryFundraisingRegistry();
    const created = reg.createCampaign({
      ownerUserId: OWNER,
      name: 'Seed',
      cap: '1000',
      price: '1',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const list = reg.listInvestors(created.campaign.id);
    expect(list.investors).toEqual([]);
    expect(list.committedAmount).toBe('0');
    expect(list.committedFrom).toBe('investor_records');
    expect(list).not.toHaveProperty('raisedAmount');
    expect(list.committedAmount).not.toBe(created.campaign.cap);
  });

  it('throws campaign_not_found rather than a fake empty raise for a missing id', () => {
    const reg = new MemoryFundraisingRegistry();
    try {
      reg.listInvestors('camp_missing');
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(FundraisingError);
      if (err instanceof FundraisingError) expect(err.code).toBe(CAMPAIGN_NOT_FOUND_CODE);
    }
  });
});

describe('package integrity', () => {
  it('does not import ledger-client', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'fundraising.ts'), 'utf8');
    expect(src).not.toMatch(/ledger-client/);
  });
});
