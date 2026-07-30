import { CHANNEL_IDS, OUT_OF_APP_CHANNELS, type ChannelId, type NotificationChannel, type RefusalCode } from './channel.js';
import { GatewayChannel, InAppChannel, UnconfiguredChannel } from './gateway.js';

/**
 * WHICH CHANNELS EXIST, AND WHICH ONE CAN ACTUALLY REACH ANYONE.
 *
 * Every channel is always registered. A channel with no credentials is
 * registered as an `UnconfiguredChannel`, not left out — because a missing key
 * in a map is indistinguishable from a channel nobody has written yet, and this
 * service has to be able to say "email exists, it is not wired, here is the env
 * var you are missing" to an operator reading `/ready`.
 *
 * The in-app inbox is always available and is the honest fallback (§13): if the
 * owner has obtained no credentials at all, users still get every notification,
 * in the app, and every out-of-app channel says on the record why it did not
 * send. That is a working notification system with three refusals — not a
 * broken one pretending.
 */

export interface ChannelEnv {
  readonly NOTIFY_EMAIL_GATEWAY_URL?: string | undefined;
  readonly NOTIFY_EMAIL_GATEWAY_TOKEN?: string | undefined;
  readonly NOTIFY_PUSH_GATEWAY_URL?: string | undefined;
  readonly NOTIFY_PUSH_GATEWAY_TOKEN?: string | undefined;
  readonly NOTIFY_SMS_GATEWAY_URL?: string | undefined;
  readonly NOTIFY_SMS_GATEWAY_TOKEN?: string | undefined;
  readonly NOTIFY_GATEWAY_TIMEOUT_MS: number;
}

/** Env var names per channel. Reported to operators verbatim, so they are data. */
const GATEWAY_ENV = {
  email: { url: 'NOTIFY_EMAIL_GATEWAY_URL', token: 'NOTIFY_EMAIL_GATEWAY_TOKEN' },
  push: { url: 'NOTIFY_PUSH_GATEWAY_URL', token: 'NOTIFY_PUSH_GATEWAY_TOKEN' },
  sms: { url: 'NOTIFY_SMS_GATEWAY_URL', token: 'NOTIFY_SMS_GATEWAY_TOKEN' },
} as const satisfies Record<(typeof OUT_OF_APP_CHANNELS)[number], { url: string; token: string }>;

export interface ChannelStatus {
  readonly channel: ChannelId;
  readonly available: boolean;
  /** Null when available. A code, never a sentence — clients render their own copy. */
  readonly reason: RefusalCode | null;
  /** Env vars an operator must set to make this channel work. Empty when it works. */
  readonly requires: readonly string[];
}

export class ChannelRegistry {
  private readonly channels: Map<ChannelId, NotificationChannel>;

  constructor(channels: readonly NotificationChannel[]) {
    this.channels = new Map(channels.map((c) => [c.channel, c]));
    for (const id of CHANNEL_IDS) {
      if (!this.channels.has(id)) {
        throw new Error(
          `ChannelRegistry is missing "${id}". Every channel must be registered — an absent channel cannot refuse, ` +
            'and a channel that cannot refuse is a channel that drops messages silently.',
        );
      }
    }
  }

  get(channel: ChannelId): NotificationChannel {
    // The constructor proved every id is present.
    return this.channels.get(channel)!;
  }

  /** Channels that could deliver right now. `inapp` is always among them. */
  availableChannels(): readonly ChannelId[] {
    return CHANNEL_IDS.filter((id) => this.get(id).unavailableReason === null);
  }

  /** The operator's view: what works, what does not, and what to set. */
  status(): readonly ChannelStatus[] {
    return CHANNEL_IDS.map((id) => {
      const channel = this.get(id);
      const requires = channel instanceof UnconfiguredChannel ? channel.missingEnv : [];
      return {
        channel: id,
        available: channel.unavailableReason === null,
        reason: channel.unavailableReason,
        requires,
      };
    });
  }
}

/**
 * Build the registry from environment.
 *
 * A URL without a token is a configuration error, not a half-configured
 * channel: an unauthenticated notification gateway is an open relay for
 * anything that can reach it. `env.ts` refuses to load in that state, and this
 * function treats the pair as all-or-nothing for the same reason.
 */
export function channelsFromEnv(env: ChannelEnv, fetchImpl: typeof fetch = fetch): ChannelRegistry {
  const channels: NotificationChannel[] = [new InAppChannel()];

  for (const id of OUT_OF_APP_CHANNELS) {
    const names = GATEWAY_ENV[id];
    const url = env[names.url as keyof ChannelEnv] as string | undefined;
    const token = env[names.token as keyof ChannelEnv] as string | undefined;

    if (url && token) {
      channels.push(new GatewayChannel(id, { url, token, timeoutMs: env.NOTIFY_GATEWAY_TIMEOUT_MS }, fetchImpl));
    } else {
      channels.push(new UnconfiguredChannel(id, [names.url, names.token]));
    }
  }

  return new ChannelRegistry(channels);
}
