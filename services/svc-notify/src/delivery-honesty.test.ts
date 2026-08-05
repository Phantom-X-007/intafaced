import { describe, expect, it } from 'vitest';
import { deliveryHonesty, missingCredentialHonesty } from './delivery-honesty.js';

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
});
