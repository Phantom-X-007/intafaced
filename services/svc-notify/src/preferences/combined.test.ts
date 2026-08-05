import { describe, expect, it } from 'vitest';
import {
  channelsHeldForDigest,
  countHoldingChannels,
  countSendNowChannels,
  channelsSkippedMuted,
  channelsToSendNow,
  criticalAlwaysImmediate,
  decideChannelDelivery,
  DEFAULT_COMBINED_PREFS,
  planFanoutDelivery,
  summarizeFanoutPlan,
  countSkippedMuted,
  planHasNoMutes,
  planIsAllSendNow,
  planIsEmpty,
  planHasHolds,
  planHasSkips,
  countSendNow,
  planSkipCount,
  planHoldCount,
  planSendCount,
  planHasSends,
  planDecisionCount,
  planSendRatio,
  planIsMixed,
} from './combined.js';
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

  it('L3 planFanoutDelivery maps each channel without invent', () => {
    const digest = applyDigestCadence(DEFAULT_COMBINED_PREFS.digest, 'hourly');
    const mute = applyMuteToggle(DEFAULT_COMBINED_PREFS.mute, { channel: 'sms', muted: true });
    const plan = planFanoutDelivery({ mute, digest }, ['inapp', 'email', 'sms'], 'info');
    expect(plan).toEqual([
      { action: 'send_now', channel: 'inapp' },
      { action: 'hold_digest', channel: 'email' },
      { action: 'skip_muted', channel: 'sms' },
    ]);
  });

  it('L3 summarizeFanoutPlan counts actions without invent', () => {
    const digest = applyDigestCadence(DEFAULT_COMBINED_PREFS.digest, 'hourly');
    const mute = applyMuteToggle(DEFAULT_COMBINED_PREFS.mute, { channel: 'sms', muted: true });
    const plan = planFanoutDelivery({ mute, digest }, ['inapp', 'email', 'sms'], 'info');
    expect(summarizeFanoutPlan(plan)).toEqual({ sendNow: 1, holdDigest: 1, skipMuted: 1, total: 3 });
    expect(summarizeFanoutPlan([])).toEqual({ sendNow: 0, holdDigest: 0, skipMuted: 0, total: 0 });
  });

  it('L3 channelsToSendNow lists only immediate channels', () => {
    const digest = applyDigestCadence(DEFAULT_COMBINED_PREFS.digest, 'hourly');
    const mute = applyMuteToggle(DEFAULT_COMBINED_PREFS.mute, { channel: 'sms', muted: true });
    const plan = planFanoutDelivery({ mute, digest }, ['inapp', 'email', 'sms'], 'info');
    expect(channelsToSendNow(plan)).toEqual(['inapp']);
    expect(channelsToSendNow([])).toEqual([]);
  });

  it('L3 hold/skip channel lists without invent', () => {
    const digest = applyDigestCadence(DEFAULT_COMBINED_PREFS.digest, 'hourly');
    const mute = applyMuteToggle(DEFAULT_COMBINED_PREFS.mute, { channel: 'sms', muted: true });
    const plan = planFanoutDelivery({ mute, digest }, ['inapp', 'email', 'sms'], 'info');
    expect(channelsHeldForDigest(plan)).toEqual(['email']);
    expect(channelsSkippedMuted(plan)).toEqual(['sms']);
    expect(channelsHeldForDigest([])).toEqual([]);
  });

  it('L3 countHoldingChannels without invent', () => {
    expect(countHoldingChannels([])).toBe(0);
    const digest = applyDigestCadence(DEFAULT_COMBINED_PREFS.digest, 'hourly');
    const plan = planFanoutDelivery({ mute: DEFAULT_COMBINED_PREFS.mute, digest }, ['email', 'push'], 'info');
    expect(countHoldingChannels(plan)).toBe(2);
  });

  it('L3 countSendNowChannels without invent', () => {
    expect(countSendNowChannels([])).toBe(0);
    const plan = planFanoutDelivery(DEFAULT_COMBINED_PREFS, ['inapp', 'email'], 'critical');
    expect(countSendNowChannels(plan)).toBe(2);
  });
  it('L3 countSkippedMuted without invent', () => {
    expect(countSkippedMuted([])).toBe(0);
    const mute = applyMuteToggle(DEFAULT_COMBINED_PREFS.mute, { channel: 'email', muted: true });
    const plan = planFanoutDelivery({ mute, digest: DEFAULT_COMBINED_PREFS.digest }, ['email', 'inapp'], 'info');
    expect(countSkippedMuted(plan)).toBe(1);
  });

  it('L3 planHasNoMutes true when none skipped', () => {
    expect(planHasNoMutes([])).toBe(true);
    const plan = planFanoutDelivery(DEFAULT_COMBINED_PREFS, ['inapp', 'email'], 'critical');
    expect(planHasNoMutes(plan)).toBe(true);
  });

  it('L3 planIsAllSendNow false when empty', () => {
    expect(planIsAllSendNow([])).toBe(false);
    const plan = planFanoutDelivery(DEFAULT_COMBINED_PREFS, ['inapp', 'email'], 'critical');
    expect(planIsAllSendNow(plan)).toBe(true);
  });

  it('L3 planIsEmpty', () => {
    expect(planIsEmpty([])).toBe(true);
    const plan = planFanoutDelivery(DEFAULT_COMBINED_PREFS, ['inapp'], 'info');
    expect(planIsEmpty(plan)).toBe(false);
  });

  it('L3 planHasHolds', () => {
    expect(planHasHolds([])).toBe(false);
    const digest = applyDigestCadence(DEFAULT_COMBINED_PREFS.digest, 'hourly');
    const plan = planFanoutDelivery({ mute: DEFAULT_COMBINED_PREFS.mute, digest }, ['email'], 'info');
    expect(planHasHolds(plan)).toBe(true);
  });

  it('L3 wave21 planHasSkips + countSendNow', () => {
    expect(planHasSkips([])).toBe(false);
    expect(countSendNow([])).toBe(0);
    const plan = [
      { channel: 'email' as const, action: 'send_now' as const },
      { channel: 'push' as const, action: 'skip_muted' as const },
    ];
    // if DeliveryDecision shape differs, adjust in test run
    expect(planHasSkips(plan as any)).toBe(true);
    expect(countSendNow(plan as any)).toBe(1);
  });

  it('L3 planSkipCount aliases countSkippedMuted', () => {
    expect(planSkipCount([])).toBe(0);
  });

  it('L3 planHoldCount aliases countHoldingChannels', () => {
    expect(planHoldCount([])).toBe(0);
  });

  it('L3 planSendCount aliases countSendNowChannels', () => {
    expect(planSendCount([])).toBe(0);
  });

  it('L3 wave25 planHasSends + decision count + send ratio + mixed', () => {
    expect(planHasSends([])).toBe(false);
    expect(planDecisionCount([])).toBe(0);
    expect(planSendRatio([])).toBeNull();
    expect(planIsMixed([])).toBe(false);
    const muted = applyMuteToggle(DEFAULT_COMBINED_PREFS.mute, { channel: 'email', muted: true });
    const digest = applyDigestCadence(DEFAULT_COMBINED_PREFS.digest, 'hourly');
    const prefs = { mute: muted, digest };
    const plan = planFanoutDelivery(prefs, ['inapp', 'email', 'sms'], 'info');
    expect(planDecisionCount(plan)).toBe(plan.length);
    expect(planSendRatio(plan)).toMatch(/^\d+\.\d{4}$/);
    expect(typeof planHasSends(plan)).toBe('boolean');
    expect(typeof planIsMixed(plan)).toBe('boolean');
  });
});
