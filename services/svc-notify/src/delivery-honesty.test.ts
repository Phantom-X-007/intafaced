import { describe, expect, it } from 'vitest';
import {
  allChannelsRefused,
  allChannelsAccepted,
  countFanoutFailures,
  countFanoutOutcomes,
  hasFanoutFailure,
  deliveryHonesty,
  fanoutHonesty,
  missingCredentialHonesty,
} from './delivery-honesty.js';

describe('notify Stage-2 delivery honesty', () => {
  it('accepted out-of-app may start grace but not claim inbox-read', () => {
    const h = deliveryHonesty({ outcome: 'accepted', channel: 'email', code: 'gateway.2xx' });
    expect(h.mayStartGraceClock).toBe(true);
    expect(h.mayMarkUserVisibleInbox).toBe(false);
  });

  it('accepted in-app may land inbox', () => {
    const h = deliveryHonesty({ outcome: 'accepted', channel: 'inapp', code: 'inbox.written' });
    expect(h.mayMarkUserVisibleInbox).toBe(true);
    expect(h.mayStartGraceClock).toBe(true);
  });

  it('refused never starts grace clocks', () => {
    const h = missingCredentialHonesty('sms');
    expect(h).toMatchObject({
      outcome: 'refused',
      mayStartGraceClock: false,
      mayMarkUserVisibleInbox: false,
      code: 'notify.sms.credentials_missing',
    });
  });

  it('failed never looks like accepted', () => {
    const h = deliveryHonesty({ outcome: 'failed', channel: 'push', code: 'transport.timeout' });
    expect(h.outcome).toBe('failed');
    expect(h.mayStartGraceClock).toBe(false);
  });

  it('L3 fanoutHonesty: grace only if any accepted; inbox only if inapp accepted', () => {
    const allFail = fanoutHonesty([
      { channel: 'email', outcome: 'refused', code: 'missing' },
      { channel: 'push', outcome: 'failed', code: 'timeout' },
    ]);
    expect(allFail.anyAccepted).toBe(false);
    expect(allFail.mayStartGraceClock).toBe(false);
    expect(allFail.mayMarkUserVisibleInbox).toBe(false);

    const mixed = fanoutHonesty([
      { channel: 'email', outcome: 'accepted', code: '2xx' },
      { channel: 'inapp', outcome: 'accepted', code: 'inbox' },
    ]);
    expect(mixed.anyAccepted).toBe(true);
    expect(mixed.mayStartGraceClock).toBe(true);
    expect(mixed.mayMarkUserVisibleInbox).toBe(true);
  });

  it('L3 countFanoutOutcomes zeros when empty; no invent accept', () => {
    expect(countFanoutOutcomes([])).toEqual({ accepted: 0, refused: 0, failed: 0, total: 0 });
    expect(
      countFanoutOutcomes([
        { channel: 'email', outcome: 'accepted', code: '2xx' },
        { channel: 'push', outcome: 'failed', code: 'timeout' },
        { channel: 'sms', outcome: 'refused', code: 'missing' },
      ]),
    ).toEqual({ accepted: 1, refused: 1, failed: 1, total: 3 });
  });

  it('L3 hasFanoutFailure detects failed outcomes only', () => {
    expect(hasFanoutFailure([])).toBe(false);
    expect(hasFanoutFailure([{ channel: 'email', outcome: 'accepted', code: '2xx' }])).toBe(false);
    expect(hasFanoutFailure([{ channel: 'email', outcome: 'failed', code: 'timeout' }])).toBe(true);
  });

  it('L3 wave10 countFanoutFailures + allChannelsRefused', () => {
    expect(countFanoutFailures([])).toBe(0);
    expect(allChannelsRefused([])).toBe(false);
    expect(
      countFanoutFailures([
        { channel: 'email', outcome: 'failed', code: 'timeout' },
        { channel: 'push', outcome: 'refused', code: 'missing' },
      ]),
    ).toBe(1);
    expect(
      allChannelsRefused([
        { channel: 'email', outcome: 'refused', code: 'missing' },
        { channel: 'sms', outcome: 'refused', code: 'missing' },
      ]),
    ).toBe(true);
    expect(allChannelsRefused([{ channel: 'email', outcome: 'accepted', code: '2xx' }])).toBe(false);
  });

  it('L3 allChannelsAccepted false on empty', () => {
    expect(allChannelsAccepted([])).toBe(false);
    expect(allChannelsAccepted([{ channel: 'email', outcome: 'accepted', code: '2xx' }])).toBe(true);
    expect(
      allChannelsAccepted([
        { channel: 'email', outcome: 'accepted', code: '2xx' },
        { channel: 'push', outcome: 'failed', code: 'x' },
      ]),
    ).toBe(false);
  });
});
