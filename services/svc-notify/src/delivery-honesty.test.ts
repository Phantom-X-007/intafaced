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
  countFanoutRefusals,
  hasAnyFanoutAcceptance,
  acceptedChannels,
  failedChannels,
  refusedChannels,
  fanoutAcceptanceRatio,
  countFanoutAccepted,
  fanoutFailureRatio,
  fanoutIsEmpty,
  fanoutAttemptCount,
  fanoutRefusalRatio,
  fanoutHasFailure,
  fanoutIsMixed,
  fanoutOutcomesPresent,
  fanoutHasNoFailures,
  fanoutHasNoRefusals,
  fanoutSuccessRatio,
  fanoutHasRefusal,
  acceptedChannelsSorted,
  failedChannelsSorted,
  refusedChannelsSorted,
  fanoutFullyAccepted,
  fanoutOutcomeHistogram,
  fanoutHistogramOnlyAccepted,
  fanoutHistogramOnlyFailed,
  fanoutHistogramOnlyRefused,
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

  it('L3 wave13 countFanoutRefusals + hasAnyFanoutAcceptance', () => {
    expect(countFanoutRefusals([])).toBe(0);
    expect(hasAnyFanoutAcceptance([])).toBe(false);
    expect(
      countFanoutRefusals([
        { channel: 'email', outcome: 'refused', code: 'missing' },
        { channel: 'push', outcome: 'failed', code: 'timeout' },
      ]),
    ).toBe(1);
    expect(hasAnyFanoutAcceptance([{ channel: 'email', outcome: 'accepted', code: '2xx' }])).toBe(true);
    expect(hasAnyFanoutAcceptance([{ channel: 'email', outcome: 'failed', code: 'x' }])).toBe(false);
  });

  it('L3 wave16 acceptedChannels + failedChannels', () => {
    expect(acceptedChannels([])).toEqual([]);
    expect(failedChannels([])).toEqual([]);
    const attempts = [
      { channel: 'email' as const, outcome: 'accepted' as const, code: '2xx' },
      { channel: 'push' as const, outcome: 'failed' as const, code: 'timeout' },
      { channel: 'sms' as const, outcome: 'refused' as const, code: 'missing' },
    ];
    expect(acceptedChannels(attempts)).toEqual(['email']);
    expect(failedChannels(attempts)).toEqual(['push']);
  });

  it('L3 wave21 refusedChannels + fanoutAcceptanceRatio', () => {
    expect(refusedChannels([])).toEqual([]);
    expect(fanoutAcceptanceRatio([])).toBeNull();
    const attempts = [
      { channel: 'email' as const, outcome: 'accepted' as const, code: '2xx' },
      { channel: 'push' as const, outcome: 'refused' as const, code: 'missing' },
    ];
    expect(refusedChannels(attempts)).toEqual(['push']);
    expect(fanoutAcceptanceRatio(attempts)).toBe('0.5000');
  });

  it('L3 wave25 accepted count + failure ratio + empty guards', () => {
    expect(countFanoutAccepted([])).toBe(0);
    expect(fanoutFailureRatio([])).toBeNull();
    expect(fanoutIsEmpty([])).toBe(true);
    expect(fanoutAttemptCount([])).toBe(0);
    const attempts = [
      { channel: 'email' as const, outcome: 'accepted' as const, code: 'ok' },
      { channel: 'push' as const, outcome: 'failed' as const, code: 'timeout' },
      { channel: 'sms' as const, outcome: 'refused' as const, code: 'no_cred' },
    ];
    expect(countFanoutAccepted(attempts)).toBe(1);
    expect(fanoutFailureRatio(attempts)).toBe('0.3333');
    expect(fanoutIsEmpty(attempts)).toBe(false);
    expect(fanoutAttemptCount(attempts)).toBe(3);
  });

  it('L3 wave26 refusal ratio + mixed + outcomes present', () => {
    expect(fanoutRefusalRatio([])).toBeNull();
    expect(fanoutHasFailure([])).toBe(false);
    expect(fanoutIsMixed([])).toBe(false);
    expect(fanoutOutcomesPresent([])).toEqual([]);
    const attempts = [
      { channel: 'email' as const, outcome: 'accepted' as const, code: 'ok' },
      { channel: 'push' as const, outcome: 'failed' as const, code: 'timeout' },
      { channel: 'sms' as const, outcome: 'refused' as const, code: 'no_cred' },
    ];
    expect(fanoutRefusalRatio(attempts)).toBe('0.3333');
    expect(fanoutHasFailure(attempts)).toBe(true);
    expect(fanoutIsMixed(attempts)).toBe(true);
    expect(fanoutOutcomesPresent(attempts)).toEqual(['accepted', 'refused', 'failed']);
  });

  it('L3 wave27 no failure/refusal + success ratio', () => {
    expect(fanoutHasNoFailures([])).toBe(true);
    expect(fanoutHasNoRefusals([])).toBe(true);
    expect(fanoutSuccessRatio([])).toBeNull();
    expect(fanoutHasRefusal([])).toBe(false);
    const attempts = [
      { channel: 'email' as const, outcome: 'accepted' as const, code: 'ok' },
      { channel: 'sms' as const, outcome: 'refused' as const, code: 'no' },
    ];
    expect(fanoutHasNoFailures(attempts)).toBe(true);
    expect(fanoutHasNoRefusals(attempts)).toBe(false);
    expect(fanoutHasRefusal(attempts)).toBe(true);
    expect(fanoutSuccessRatio(attempts)).toBe('0.5000');
  });

  it('L3 wave28 sorted channels + fully accepted', () => {
    expect(acceptedChannelsSorted([])).toEqual([]);
    expect(failedChannelsSorted([])).toEqual([]);
    expect(refusedChannelsSorted([])).toEqual([]);
    expect(fanoutFullyAccepted([])).toBe(false);
    const attempts = [
      { channel: 'sms' as const, outcome: 'accepted' as const, code: 'ok' },
      { channel: 'email' as const, outcome: 'accepted' as const, code: 'ok' },
      { channel: 'push' as const, outcome: 'failed' as const, code: 'x' },
    ];
    expect(acceptedChannelsSorted(attempts)).toEqual(['email', 'sms']);
    expect(failedChannelsSorted(attempts)).toEqual(['push']);
    expect(fanoutFullyAccepted(attempts)).toBe(false);
    expect(fanoutFullyAccepted(attempts.filter((a) => a.outcome === 'accepted'))).toBe(true);
  });

  it('L3 wave29 outcome histogram purity', () => {
    expect(fanoutOutcomeHistogram([])).toEqual({ accepted: 0, refused: 0, failed: 0 });
    expect(fanoutHistogramOnlyAccepted([])).toBe(false);
    const ok = [{ channel: 'email' as const, outcome: 'accepted' as const, code: 'ok' }];
    expect(fanoutHistogramOnlyAccepted(ok)).toBe(true);
    const fail = [{ channel: 'push' as const, outcome: 'failed' as const, code: 'x' }];
    expect(fanoutHistogramOnlyFailed(fail)).toBe(true);
    const ref = [{ channel: 'sms' as const, outcome: 'refused' as const, code: 'n' }];
    expect(fanoutHistogramOnlyRefused(ref)).toBe(true);
  });
});
