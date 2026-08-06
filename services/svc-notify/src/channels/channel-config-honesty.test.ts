import { describe, expect, it } from 'vitest';
import {
  channelConfigCount,
  configuredOutOfAppCount,
  unconfiguredOutOfAppCount,
  requiredUnconfiguredCount,
  channelConfigBoardCard,
  channelConfigStatusLine,
  parseChannelConfigStatusLine,
  channelConfigStatusLineMatches,
  channelConfigStatusLineConsistent,
  channelConfigExportHeader,
  channelConfigExportLine,
  channelConfigExportText,
  channelConfigRequiredReady,
  channelConfigCountInRange,
  type ChannelConfigBoardInput,
} from './channel-config-honesty.js';

describe('L3 wave73 channel config honesty', () => {
  it('empty and mixed channel boards', () => {
    const empty: readonly ChannelConfigBoardInput[] = [];
    expect(channelConfigCount(empty)).toBe(0);
    expect(channelConfigStatusLineMatches(empty)).toBe(true);
    expect(channelConfigStatusLineConsistent(channelConfigStatusLine(empty))).toBe(true);
    expect(parseChannelConfigStatusLine('nope')).toBeNull();

    const mixed: readonly ChannelConfigBoardInput[] = [
      { id: 'in_app', configured: true, required: false },
      { id: 'email', configured: true, required: true },
      { id: 'push', configured: false, required: false },
      { id: 'sms', configured: false, required: true },
    ];
    expect(channelConfigCount(mixed)).toBe(4);
    expect(configuredOutOfAppCount(mixed)).toBe(1);
    expect(unconfiguredOutOfAppCount(mixed)).toBe(2);
    expect(requiredUnconfiguredCount(mixed)).toBe(1);
    expect(channelConfigBoardCard(mixed)).toEqual({
      channels: 4,
      configured: 2,
      unconfigured: 2,
      requiredUnconfigured: 1,
      inAppPresent: true,
    });
    expect(channelConfigStatusLine(mixed)).toBe('channels=4 configured=2 unconfigured=2 required_unconfigured=1 in_app=1');
    expect(channelConfigStatusLineMatches(mixed)).toBe(true);
    expect(channelConfigStatusLineConsistent(channelConfigStatusLine(mixed))).toBe(true);
    expect(channelConfigExportText(mixed).startsWith(channelConfigExportHeader())).toBe(true);
    expect(channelConfigExportLine(mixed)).toBe('4,2,2,1,1');
    expect(channelConfigRequiredReady(mixed)).toBe(false);
    expect(channelConfigCountInRange(mixed, 4, 4)).toBe(true);
    expect(channelConfigCountInRange(mixed, 5, 1)).toBe(false);

    const ready: readonly ChannelConfigBoardInput[] = [
      { id: 'in_app', configured: true, required: false },
      { id: 'email', configured: true, required: true },
    ];
    expect(channelConfigRequiredReady(ready)).toBe(true);
  });
});
