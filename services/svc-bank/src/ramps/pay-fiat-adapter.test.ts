import { describe, expect, it } from 'vitest';
import { BankError } from '../errors.js';
import {
  assertEmptyRailsCannotLookLive,
  emptyPayFiatRampPort,
  inRepoPayFiatRampPort,
  IN_REPO_PAY_FIAT_RAILS,
  resolvePayFiatRailId,
  selectLivePayFiatRail,
  type PayFiatRailSnapshot,
  type PayFiatRampPort,
} from './pay-fiat-adapter.js';

const SANDBOX: PayFiatRailSnapshot = {
  railId: 'card-sandbox',
  mode: 'sandbox',
  capabilities: ['onramp', 'offramp'],
};

const ABSENT: PayFiatRailSnapshot = {
  railId: 'bank-payout',
  mode: 'absent',
  capabilities: ['offramp'],
};

const LIVE_ON: PayFiatRailSnapshot = {
  railId: 'pay-fiat-live',
  mode: 'live',
  capabilities: ['onramp'],
};

const LIVE_BOTH: PayFiatRailSnapshot = {
  railId: 'pay-fiat-ach',
  mode: 'live',
  capabilities: ['onramp', 'offramp'],
};

const REFUSE = 'bank.fiat_ramp_no_pay_adapter';

describe('PayFiatRampPort — D26-P1-B4 fiat via pay adapters', () => {
  it('empty port is the boot default and never invents a rail', async () => {
    await expect(resolvePayFiatRailId(emptyPayFiatRampPort, 'onramp')).rejects.toMatchObject({
      code: REFUSE,
    });
    await expect(resolvePayFiatRailId(null, 'offramp')).rejects.toMatchObject({
      code: REFUSE,
    });
  });

  it('in-repo svc-pay adapters cannot settle fiat (no invented live rail)', async () => {
    expect(selectLivePayFiatRail(IN_REPO_PAY_FIAT_RAILS, 'onramp')).toBeNull();
    expect(selectLivePayFiatRail(IN_REPO_PAY_FIAT_RAILS, 'offramp')).toBeNull();
    await expect(resolvePayFiatRailId(inRepoPayFiatRampPort, 'onramp')).rejects.toMatchObject({
      code: REFUSE,
    });
    await expect(resolvePayFiatRailId(inRepoPayFiatRampPort, 'offramp')).rejects.toMatchObject({
      code: REFUSE,
    });
  });

  it('sandbox and absent pay rails cannot host bank fiat (no PSP laundering)', async () => {
    const port: PayFiatRampPort = { listFiatRails: () => [SANDBOX, ABSENT] };
    await expect(resolvePayFiatRailId(port, 'onramp')).rejects.toMatchObject({
      code: REFUSE,
    });
    expect(selectLivePayFiatRail([SANDBOX, ABSENT], 'onramp')).toBeNull();
  });

  it('selects only a live rail that declares the capability', async () => {
    expect(selectLivePayFiatRail([LIVE_ON, LIVE_BOTH], 'offramp')?.railId).toBe('pay-fiat-ach');
    expect(selectLivePayFiatRail([LIVE_ON], 'offramp')).toBeNull();
    await expect(resolvePayFiatRailId({ listFiatRails: () => [LIVE_ON] }, 'offramp')).rejects.toMatchObject({
      code: REFUSE,
    });
    await expect(resolvePayFiatRailId({ listFiatRails: () => [LIVE_BOTH] }, 'offramp')).resolves.toBe('pay-fiat-ach');
  });

  it('refusal message names the socket, the pay-adapter path, and no FX invent', async () => {
    try {
      await resolvePayFiatRailId({ listFiatRails: () => [SANDBOX] }, 'onramp');
      expect.fail('expected refuse');
    } catch (err) {
      expect(err).toMatchObject({ code: REFUSE });
      const msg = String((err as Error).message);
      expect(msg).toContain('socket.psp-partners');
      expect(msg).toContain('RailAdapter');
      expect(msg).toContain('card-sandbox:sandbox');
      expect(msg).toMatch(/No invented FX rate/i);
      expect(msg).not.toMatch(/APY|BIN/i);
    }
  });

  it('fails if a ramp looks live with empty rails', () => {
    expect(() => assertEmptyRailsCannotLookLive([], { simulated: false })).toThrow(BankError);
    expect(() => assertEmptyRailsCannotLookLive([], { simulated: true, looksLive: true })).toThrow(
      /cannot look live/,
    );
    expect(() => assertEmptyRailsCannotLookLive(IN_REPO_PAY_FIAT_RAILS, { simulated: false })).toThrow(
      /cannot look live/,
    );
    try {
      assertEmptyRailsCannotLookLive([], { simulated: false });
      expect.fail('expected refuse');
    } catch (err) {
      expect(err).toMatchObject({ code: REFUSE });
    }
    expect(() => assertEmptyRailsCannotLookLive([], { simulated: true })).not.toThrow();
    expect(() => assertEmptyRailsCannotLookLive([LIVE_BOTH], { simulated: false })).not.toThrow();
  });

  it('PayFiatRailSnapshot has no FX rate to invent from', () => {
    const keys = Object.keys(LIVE_BOTH).sort();
    expect(keys).toEqual(['capabilities', 'mode', 'railId']);
    expect(keys).not.toContain('fxRate');
    expect(keys).not.toContain('rate');
    expect(keys).not.toContain('mark');
  });
});
