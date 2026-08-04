import { describe, expect, it } from 'vitest';
import {
  EMPTY_MUTE_PREFS,
  MemoryMuteStore,
  MuteUpdateError,
  applyMuteToggle,
  isChannelMuted,
} from './mute.js';

describe('isChannelMuted — critical never silenced', () => {
  const mutedEmail = { muted: new Set(['email'] as const) };

  it('mutes info/action on a muted channel', () => {
    expect(isChannelMuted(mutedEmail, 'email', 'info')).toBe(true);
    expect(isChannelMuted(mutedEmail, 'email', 'action')).toBe(true);
    expect(isChannelMuted(mutedEmail, 'push', 'info')).toBe(false);
  });

  it('never mutes critical even when channel is muted', () => {
    expect(isChannelMuted(mutedEmail, 'email', 'critical')).toBe(false);
    expect(isChannelMuted(EMPTY_MUTE_PREFS, 'email', 'critical')).toBe(false);
  });
});

describe('applyMuteToggle / MemoryMuteStore', () => {
  it('toggles email mute', () => {
    const a = applyMuteToggle(EMPTY_MUTE_PREFS, { channel: 'email', muted: true });
    expect([...a.muted]).toEqual(['email']);
    const b = applyMuteToggle(a, { channel: 'email', muted: false });
    expect(b.muted.size).toBe(0);
  });

  it('refuses unknown channels', () => {
    expect(() => applyMuteToggle(EMPTY_MUTE_PREFS, { channel: 'carrier-pigeon', muted: true })).toThrow(
      MuteUpdateError,
    );
  });

  it('stores per user', () => {
    const store = new MemoryMuteStore();
    store.setMuted('u1', 'sms', true);
    expect(isChannelMuted(store.get('u1'), 'sms', 'info')).toBe(true);
    expect(isChannelMuted(store.get('u2'), 'sms', 'info')).toBe(false);
  });
});
