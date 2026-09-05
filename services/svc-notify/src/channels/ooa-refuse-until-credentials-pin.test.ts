/**
 * Unit card — out-of-app channels refuse until Class X owner credentials
 * 1. Promise: email / push / SMS stay channel.not_configured until the owner
 *    sets gateway URL + token; never invent a delivered receipt
 * 2. Break: unconfigured adapter returns accepted → margin-call email "went out"
 *    on a row nobody's transport ever saw
 * 3. Done bar: UnconfiguredChannel.deliver throws channel.not_configured for
 *    every out-of-app id; InAppChannel may accept; channelsFromEnv with no
 *    gateway env never constructs Email/Push/SmsChannel
 * 4. Class N
 * 5. Paths: services/svc-notify/src/channels/{gateway,registry,channel}
 * 6. RED: expect refusal, not a receipt
 * 7. Collision: none
 */

import { describe, expect, it } from 'vitest';
import { ChannelRefusal, OUT_OF_APP_CHANNELS } from './channel.js';
import { InAppChannel, UnconfiguredChannel } from './gateway.js';
import { EmailChannel, PushChannel, SmsChannel } from './adapters.js';
import { GATEWAY_ENV, channelsFromEnv } from './registry.js';
import type { OutboundMessage } from './channel.js';

const NO_GATEWAYS = { NOTIFY_GATEWAY_TIMEOUT_MS: 1_000 } as const;

function message(over: Partial<OutboundMessage> = {}): OutboundMessage {
  return {
    notificationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    userId: '11111111-1111-4111-8111-111111111111',
    channel: 'email',
    kind: 'bank.margin_call',
    severity: 'critical',
    titleKey: 'notify.bank.margin_call.title',
    bodyKey: 'notify.bank.margin_call.body',
    title: 'Margin call on your loan',
    body: 'Add 0.0415 BTC to restore your margin.',
    href: '/bank/loans/abc',
    locale: 'en',
    address: 'borrower@example.com',
    idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:email',
    ...over,
  };
}

describe('out-of-app channels refuse until owner credentials', () => {
  it('UnconfiguredChannel throws channel.not_configured and never returns a receipt', async () => {
    for (const id of OUT_OF_APP_CHANNELS) {
      const missing = [GATEWAY_ENV[id].url, GATEWAY_ENV[id].token];
      const channel = new UnconfiguredChannel(id, missing);
      expect(channel.unavailableReason).toBe('channel.not_configured');

      let threw: unknown;
      try {
        await channel.deliver();
      } catch (err) {
        threw = err;
      }
      expect(threw).toBeInstanceOf(ChannelRefusal);
      expect(threw).toMatchObject({ name: 'ChannelRefusal', channel: id, code: 'channel.not_configured' });
    }
  });

  it('in-app may deliver without any gateway env', async () => {
    const receipt = await new InAppChannel().deliver(message({ channel: 'inapp', address: '' }));
    expect(receipt.reference).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('channelsFromEnv with no credentials registers UnconfiguredChannel, not a wired adapter', () => {
    const reg = channelsFromEnv(NO_GATEWAYS);
    expect(reg.get('email')).toBeInstanceOf(UnconfiguredChannel);
    expect(reg.get('push')).toBeInstanceOf(UnconfiguredChannel);
    expect(reg.get('sms')).toBeInstanceOf(UnconfiguredChannel);
    expect(reg.get('email')).not.toBeInstanceOf(EmailChannel);
    expect(reg.get('push')).not.toBeInstanceOf(PushChannel);
    expect(reg.get('sms')).not.toBeInstanceOf(SmsChannel);
    expect(reg.get('inapp')).toBeInstanceOf(InAppChannel);
    expect(reg.availableChannels()).toEqual(['inapp']);
    for (const id of OUT_OF_APP_CHANNELS) {
      expect(reg.status().find((s) => s.channel === id)).toMatchObject({
        configured: false,
        available: false,
        reason: 'channel.not_configured',
        requires: [GATEWAY_ENV[id].url, GATEWAY_ENV[id].token],
      });
    }
  });
});
