import { describe, expect, it } from 'vitest';
import { criticalAlwaysImmediate, decideChannelDelivery, DEFAULT_COMBINED_PREFS } from './combined.js';
import { applyMuteToggle } from './mute.js';
import { applyDigestCadence } from './digest.js';

describe('notify L3 combined mute + digest', () => {
  it('inapp always send_now', () => {
    expect(decideChannelDelivery(DEFAULT_COMBINED_PREFS, 'inapp', 'info')).toEqual({
      action: 'send_now',
      channel: 'inapp',
    });
  });

  it('muted non-critical skips; critical still send_now', () => {
    const mute = applyMuteToggle(DEFAULT_COMBINED_PREFS.mute, { channel: 'email', muted: true });
    const prefs = { mute, digest: DEFAULT_COMBINED_PREFS.digest };
    expect(decideChannelDelivery(prefs, 'email', 'info')).toEqual({ action: 'skip_muted', channel: 'email' });
    expect(decideChannelDelivery(prefs, 'email', 'critical')).toEqual({ action: 'send_now', channel: 'email' });
    expect(criticalAlwaysImmediate(prefs, 'email')).toBe(true);
  });

  it('hourly digest holds info; critical immediate', () => {
    const digest = applyDigestCadence(DEFAULT_COMBINED_PREFS.digest, 'hourly');
    const prefs = { mute: DEFAULT_COMBINED_PREFS.mute, digest };
    expect(decideChannelDelivery(prefs, 'push', 'info')).toEqual({ action: 'hold_digest', channel: 'push' });
    expect(decideChannelDelivery(prefs, 'push', 'critical')).toEqual({ action: 'send_now', channel: 'push' });
  });
});
