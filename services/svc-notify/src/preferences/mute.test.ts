import { describe, expect, it } from 'vitest';
import {
  EMPTY_MUTE_PREFS,
  MemoryMuteStore,
  MuteUpdateError,
  applyMuteToggle,
  countMutedChannels,
  isChannelMuted,
  allMuteableMuted,
  listMutedChannels,
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
    expect(() => applyMuteToggle(EMPTY_MUTE_PREFS, { channel: 'carrier-pigeon', muted: true })).toThrow(MuteUpdateError);
  });

  it('stores per user', () => {
    const store = new MemoryMuteStore();
    store.setMuted('u1', 'sms', true);
    expect(isChannelMuted(store.get('u1'), 'sms', 'info')).toBe(true);
    expect(isChannelMuted(store.get('u2'), 'sms', 'info')).toBe(false);
  });

  it('L3 countMutedChannels without invent', () => {
    expect(countMutedChannels(EMPTY_MUTE_PREFS)).toBe(0);
    const muted = applyMuteToggle(EMPTY_MUTE_PREFS, { channel: 'email', muted: true });
    expect(countMutedChannels(muted)).toBe(1);
  });

  it('L3 listMutedChannels sorted muteable only', () => {
    expect(listMutedChannels(EMPTY_MUTE_PREFS)).toEqual([]);
    let prefs = applyMuteToggle(EMPTY_MUTE_PREFS, { channel: 'sms', muted: true });
    prefs = applyMuteToggle(prefs, { channel: 'email', muted: true });
    expect(listMutedChannels(prefs)).toEqual(['email', 'sms']);
  });

  it('L3 allMuteableMuted only when all three muted', () => {
    expect(allMuteableMuted(EMPTY_MUTE_PREFS)).toBe(false);
    let prefs = applyMuteToggle(EMPTY_MUTE_PREFS, { channel: 'email', muted: true });
    prefs = applyMuteToggle(prefs, { channel: 'push', muted: true });
    prefs = applyMuteToggle(prefs, { channel: 'sms', muted: true });
    expect(allMuteableMuted(prefs)).toBe(true);
  });
});
