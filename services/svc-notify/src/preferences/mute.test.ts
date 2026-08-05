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
  muteBoardCard,
  muteExportLines,
  muteExportHeader,
  muteExportText,
  parseMuteExportLine,
  countMuteExportDataLines,
  muteExportHasHeader,
  muteExportRoundTripOk,
  muteStatusLine,
  muteStatusLineIsEmpty,
  muteStatusLineDetailed,
  muteStatusLineTokenCount,
  parseMuteStatusLine,
  muteStatusLineMatches,
  muteStatusLineConsistent,
  mutedCountInRange,
  mutedCountAtLeast,
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

  it('L3 wave43 mute board + export/parse', () => {
    expect(muteBoardCard(EMPTY_MUTE_PREFS).fullyUnmuted).toBe(true);
    expect(muteExportHeader()).toBe('channel,muted');
    expect(muteExportLines(EMPTY_MUTE_PREFS)).toHaveLength(3);
    expect(parseMuteExportLine('email,1')).toEqual({ channel: 'email', muted: true });
    expect(parseMuteExportLine('channel,muted')).toBeNull();
    const one = applyMuteToggle(EMPTY_MUTE_PREFS, { channel: 'email', muted: true });
    expect(muteBoardCard(one).single).toBe(true);
    expect(muteExportText(one)).toContain('email,1');
  });
});

describe('L3 wave47 mute export/status', () => {
  const prefs = { muted: new Set(['email'] as const) };

  it('export round-trip and header', () => {
    const text = muteExportText(prefs);
    expect(muteExportHasHeader(text)).toBe(true);
    expect(countMuteExportDataLines(text)).toBe(3);
    expect(muteExportRoundTripOk(prefs)).toBe(true);
    expect(muteExportRoundTripOk(EMPTY_MUTE_PREFS)).toBe(true);
  });

  it('status line matches and consistent', () => {
    expect(muteStatusLine(prefs)).toBe('muted=1 unmuted=2');
    expect(muteStatusLineIsEmpty(EMPTY_MUTE_PREFS)).toBe(true);
    expect(muteStatusLineMatches(prefs)).toBe(true);
    expect(muteStatusLineConsistent(muteStatusLine(prefs))).toBe(true);
    expect(parseMuteStatusLine('nope')).toBeNull();
    expect(muteStatusLineDetailed(prefs)).toContain('single=1');
    expect(muteStatusLineTokenCount(prefs)).toBe(4);
  });

  it('range guards refuse invalid bounds', () => {
    expect(mutedCountInRange(prefs, 0, 2)).toBe(true);
    expect(mutedCountInRange(prefs, 2, 0)).toBe(false);
    expect(mutedCountInRange(prefs, Number.NaN, 2)).toBe(false);
    expect(mutedCountAtLeast(prefs, 1)).toBe(true);
    expect(mutedCountAtLeast(prefs, Number.NaN)).toBe(false);
  });
});
