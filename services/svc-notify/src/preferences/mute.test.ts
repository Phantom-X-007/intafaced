import { describe, expect, it } from 'vitest';
import {
  EMPTY_MUTE_PREFS,
  MemoryMuteStore,
  MuteUpdateError,
  applyMuteToggle,
  countMutedChannels,
  isChannelMuted,
  allMuteableMuted,
  hasAnyMute,
  listMutedChannels,
  isFullyUnmuted,
  allMuteableChannels,
  listUnmutedChannels,
  mutedChannelRatio,
  hasSingleMute,
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

  it('L3 hasAnyMute false when empty', () => {
    expect(hasAnyMute(EMPTY_MUTE_PREFS)).toBe(false);
    const m = applyMuteToggle(EMPTY_MUTE_PREFS, { channel: 'email', muted: true });
    expect(hasAnyMute(m)).toBe(true);
  });
  it('L3 isFullyUnmuted true when empty', () => {
    expect(isFullyUnmuted(EMPTY_MUTE_PREFS)).toBe(true);
    const m = applyMuteToggle(EMPTY_MUTE_PREFS, { channel: 'sms', muted: true });
    expect(isFullyUnmuted(m)).toBe(false);
  });

  it('L3 wave16 isMuted + muteCount', () => {
    const store = new MemoryMuteStore();
    expect(store.isMuted('u1', 'email')).toBe(false);
    expect(store.muteCount('u1')).toBe(0);
    store.setMuted('u1', 'email', true);
    store.setMuted('u1', 'push', true);
    expect(store.isMuted('u1', 'email')).toBe(true);
    expect(store.muteCount('u1')).toBe(2);
  });

  it('L3 wave35 muteable list + unmuted + ratio + single', () => {
    expect(allMuteableChannels()).toEqual(['email', 'push', 'sms']);
    expect(listUnmutedChannels(EMPTY_MUTE_PREFS)).toEqual(['email', 'push', 'sms']);
    expect(mutedChannelRatio(EMPTY_MUTE_PREFS)).toBe('0.0000');
    expect(hasSingleMute(EMPTY_MUTE_PREFS)).toBe(false);
    const one = applyMuteToggle(EMPTY_MUTE_PREFS, { channel: 'email', muted: true });
    expect(hasSingleMute(one)).toBe(true);
    expect(listUnmutedChannels(one)).toEqual(['push', 'sms']);
    expect(mutedChannelRatio(one)).toBe('0.3333');
  });
});
