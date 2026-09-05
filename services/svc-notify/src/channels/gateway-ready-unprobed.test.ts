/**
 * Unit card — /ready does not sell gateway URL-set as reachable
 * 1. Promise: URL+token is configured / unprobed; never available without a POST
 * 2. Break: GatewayChannel.unavailableReason null → available:true on /ready
 *    while nobody has POSTed (same class as P2P moderationConfigured ≠ reachable)
 * 3. Done bar: channelsFromEnv with URL+token → configured true, available false,
 *    reason channel.unprobed; deliver() still POSTs; required+credentials still boot
 * 4. Class N
 * 5. Paths: services/svc-notify/src/channels/{registry,gateway,channel}
 * 6. RED: expect available:false + unprobed, not available:true
 * 7. Collision: none
 */

import { describe, expect, it } from 'vitest';
import { EmailChannel } from './adapters.js';
import { InAppChannel, UnconfiguredChannel } from './gateway.js';
import { ChannelRegistry, channelsFromEnv } from './registry.js';

const NO_GATEWAYS = { NOTIFY_GATEWAY_TIMEOUT_MS: 1_000 } as const;
const WIRED_EMAIL = {
  ...NO_GATEWAYS,
  NOTIFY_EMAIL_GATEWAY_URL: 'https://gateway.internal/send',
  NOTIFY_EMAIL_GATEWAY_TOKEN: 'a-token-long-enough-to-pass',
} as const;

describe('gateway ready honesty — configured is not reachable', () => {
  it('blank env is not_configured, not unprobed', () => {
    const email = channelsFromEnv(NO_GATEWAYS)
      .status()
      .find((s) => s.channel === 'email');
    expect(email).toMatchObject({
      configured: false,
      available: false,
      reason: 'channel.not_configured',
    });
    expect(channelsFromEnv(NO_GATEWAYS).get('email')).toBeInstanceOf(UnconfiguredChannel);
  });

  it('URL+token is configured and unprobed — never available', () => {
    const reg = channelsFromEnv(WIRED_EMAIL);
    expect(reg.get('email')).toBeInstanceOf(EmailChannel);
    expect(reg.get('email').unavailableReason).toBeNull();
    expect(reg.status().find((s) => s.channel === 'email')).toMatchObject({
      configured: true,
      available: false,
      reason: 'channel.unprobed',
      requires: [],
    });
    expect(reg.availableChannels()).toEqual(['inapp']);
  });

  it('in-app stays available — inbox insert needs no gateway POST', () => {
    const inapp = channelsFromEnv(WIRED_EMAIL)
      .status()
      .find((s) => s.channel === 'inapp');
    expect(inapp).toMatchObject({ configured: true, available: true, reason: null });
    expect(channelsFromEnv(WIRED_EMAIL).get('inapp')).toBeInstanceOf(InAppChannel);
  });

  it('kill-switch names disabled, not unprobed, when credentials exist', () => {
    const email = channelsFromEnv({ ...WIRED_EMAIL, NOTIFY_OUT_OF_APP_ENABLED: false })
      .status()
      .find((s) => s.channel === 'email');
    expect(email).toMatchObject({ configured: true, available: false, reason: 'channel.disabled' });
  });

  it('required + URL+token still constructs — unprobed is a door, not a boot refuse', () => {
    const reg = channelsFromEnv({ ...WIRED_EMAIL, NOTIFY_REQUIRED_CHANNELS: 'email' });
    expect(reg.status().find((s) => s.channel === 'email')).toMatchObject({
      configured: true,
      available: false,
      reason: 'channel.unprobed',
      required: true,
    });
  });

  it('required + missing credentials still fails at construct', () => {
    expect(
      () =>
        new ChannelRegistry(
          [
            new InAppChannel(),
            new UnconfiguredChannel('email', ['NOTIFY_EMAIL_GATEWAY_URL', 'NOTIFY_EMAIL_GATEWAY_TOKEN']),
            new UnconfiguredChannel('push', ['NOTIFY_PUSH_GATEWAY_URL', 'NOTIFY_PUSH_GATEWAY_TOKEN']),
            new UnconfiguredChannel('sms', ['NOTIFY_SMS_GATEWAY_URL', 'NOTIFY_SMS_GATEWAY_TOKEN']),
          ],
          ['email'],
        ),
    ).toThrow(/NOTIFY_REQUIRED_CHANNELS/);
  });
});
