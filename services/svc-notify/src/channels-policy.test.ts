import { describe, expect, it } from 'vitest';
import { describeChannelsPolicy } from './channels-policy.js';

describe('describeChannelsPolicy', () => {
  it('summarizes mountain vs socket split without inventing providers', () => {
    const p = describeChannelsPolicy();
    expect(p.mountainId).toBe('ops.notifications');
    expect(p.outOfAppChannels.length).toBeGreaterThan(0);
    expect(p.socketIds.length).toBe(p.outOfAppChannels.length);
    expect(p.matrixComplete).toBe(true);
    expect(p.inappHasNoSocket).toBe(true);
    expect(p.inventsProviders).toBe(false);
    expect(p.acceptedIsNotDelivered).toBe(true);
  });
});
