import { describe, expect, it } from 'vitest';
import {
  emptyPayFiatRampPort,
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

describe('PayFiatRampPort — D26-P1-B4 fiat via pay adapters', () => {
  it('empty port is the boot default and never invents a rail', async () => {
    await expect(resolvePayFiatRailId(emptyPayFiatRampPort, 'onramp')).rejects.toMatchObject({
      code: 'bank.fiat_ramp_socket',
    });
    await expect(resolvePayFiatRailId(null, 'offramp')).rejects.toMatchObject({
      code: 'bank.fiat_ramp_socket',
    });
  });

  it('sandbox and absent pay rails cannot host bank fiat (no PSP laundering)', async () => {
    const port: PayFiatRampPort = { listFiatRails: () => [SANDBOX, ABSENT] };
    await expect(resolvePayFiatRailId(port, 'onramp')).rejects.toMatchObject({
      code: 'bank.fiat_ramp_socket',
    });
    expect(selectLivePayFiatRail([SANDBOX, ABSENT], 'onramp')).toBeNull();
  });

  it('selects only a live rail that declares the capability', async () => {
    expect(selectLivePayFiatRail([LIVE_ON, LIVE_BOTH], 'offramp')?.railId).toBe('pay-fiat-ach');
    expect(selectLivePayFiatRail([LIVE_ON], 'offramp')).toBeNull();
    await expect(resolvePayFiatRailId({ listFiatRails: () => [LIVE_ON] }, 'offramp')).rejects.toMatchObject({
      code: 'bank.fiat_ramp_socket',
    });
    await expect(resolvePayFiatRailId({ listFiatRails: () => [LIVE_BOTH] }, 'offramp')).resolves.toBe('pay-fiat-ach');
  });

  it('refusal message names the socket and the pay-adapter path', async () => {
    try {
      await resolvePayFiatRailId({ listFiatRails: () => [SANDBOX] }, 'onramp');
      expect.fail('expected refuse');
    } catch (err) {
      expect(err).toMatchObject({ code: 'bank.fiat_ramp_socket' });
      const msg = String((err as Error).message);
      expect(msg).toContain('socket.psp-partners');
      expect(msg).toContain('RailAdapter');
      expect(msg).toContain('card-sandbox:sandbox');
      expect(msg).not.toMatch(/APY|BIN/i);
    }
  });
});
