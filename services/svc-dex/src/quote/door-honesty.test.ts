import { describe, expect, it } from 'vitest';
import { dexDoorHonesty, dexHealthHonesty, dexReadyHonesty } from './door-honesty.js';

describe('Q-dex door honesty — internal book is not non-custodial', () => {
  it('when the internal book is on, names it custodial fiat — never AMM, never self-custody', () => {
    const door = dexDoorHonesty({ internalBookEnabled: true, internalBookPriced: true });
    expect(door.serviceHoldsBalances).toBe(false);
    expect(door.internalBook).toEqual({
      enabled: true,
      priced: true,
      custodial: true,
      plane: 'fiat',
      venueKind: 'internal',
      amm: false,
    });
    expect(door.ammVenueWired).toBe(false);
    expect(JSON.stringify(door)).not.toMatch(/"custodial":false/);
  });

  it('when the internal book is off, still does not claim the door is a non-custodial AMM', () => {
    const door = dexDoorHonesty({ internalBookEnabled: false });
    expect(door.internalBook).toEqual({ enabled: false, amm: false });
    expect(door.ammVenueWired).toBe(false);
    expect(JSON.stringify(door)).not.toMatch(/"custodial":false/);
  });

  it('health and ready reuse the same named fields — no custodial:false shortcut', () => {
    const health = dexHealthHonesty({ internalBookEnabled: true });
    const ready = dexReadyHonesty({ internalBookEnabled: true });
    expect(health.ok).toBe(true);
    expect(health.service).toBe('svc-dex');
    expect(ready.ready).toBe(true);
    expect(health.internalBook).toMatchObject({ enabled: true, custodial: true });
    expect(ready.internalBook).toMatchObject({ enabled: true, custodial: true });
    expect(JSON.stringify(health)).not.toMatch(/"custodial":false/);
    expect(JSON.stringify(ready)).not.toMatch(/"custodial":false/);
  });
});
