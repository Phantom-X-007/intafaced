import {
  ChannelDeliveryError,
  ChannelRefusal,
  type ChannelId,
  type DeliveryReceipt,
  type NotificationChannel,
  type OutboundMessage,
  type RefusalCode,
} from './channel.js';

/**
 * THE OUT-OF-APP TRANSPORT — one adapter, three channels.
 *
 * Email, push and SMS differ in the address they take and the copy they carry;
 * they do not differ in how this service reaches them. Each is an authenticated
 * HTTP POST to a URL the owner configures. Whoever answers that URL — a mail
 * relay, a push service, an SMS aggregator, or the owner's own forwarder — is
 * configuration. This file cannot name them and must not: §0.7 keeps partner
 * names out of shipped code, and a hard-coded vendor SDK would also make
 * "swap the provider" a code change instead of an env change (§0.4).
 *
 * WHY NOT A VENDOR SDK
 *
 * Three SDKs would be three dependency trees, three retry semantics, three
 * credential shapes and three names that the brand scan would have to allow. One
 * POST with an idempotency key is a smaller, honest surface, and the owner can
 * put anything behind it. The cost is real and stated: the owner must run or buy
 * something that speaks it. That cost is named in the README, not hidden.
 *
 * WHAT IT SENDS
 *
 *   POST <gateway url>
 *   authorization: Bearer <token>
 *   idempotency-key: <notificationId>:<channel>
 *   { channel, notificationId, to, locale, severity, kind, title, body, href,
 *     titleKey, bodyKey }
 *
 * Copy is rendered before it gets here, so a gateway needs no catalog. The keys
 * ride along for a gateway that has its own templates.
 */

export interface GatewayConfig {
  readonly url: string;
  readonly token: string;
  readonly timeoutMs: number;
}

/** Statuses worth trying again. Everything else is a bug on one side or the other. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export class GatewayChannel implements NotificationChannel {
  readonly unavailableReason: RefusalCode | null = null;

  constructor(
    readonly channel: ChannelId,
    private readonly config: GatewayConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async deliver(message: OutboundMessage): Promise<DeliveryReceipt> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.config.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.token}`,
          // At-least-once is the only delivery. A gateway that honours this
          // header turns our retry into their no-op; one that ignores it is why
          // we ALSO guard on our own delivery row before ever calling.
          'idempotency-key': message.idempotencyKey,
        },
        body: JSON.stringify({
          channel: message.channel,
          notificationId: message.notificationId,
          to: message.address,
          locale: message.locale,
          severity: message.severity,
          kind: message.kind,
          title: message.title,
          body: message.body,
          href: message.href,
          titleKey: message.titleKey,
          bodyKey: message.bodyKey,
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (err) {
      // Network error, DNS failure, timeout. The gateway may well be fine in a
      // minute, so this is retryable and the message is nak'd back to the bus.
      throw new ChannelDeliveryError(this.channel, err instanceof Error ? err.message : String(err), { retryable: true });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ChannelDeliveryError(this.channel, `gateway responded ${response.status}: ${truncate(body, 300)}`, {
        retryable: isRetryableStatus(response.status),
        status: response.status,
      });
    }

    return { reference: await readReference(response) };
  }
}

/**
 * A channel with no credentials.
 *
 * It refuses, loudly and by name, every single time. It does NOT accept the
 * message and drop it, and it does NOT pretend to send: an adapter that returns
 * success while doing nothing is the exact failure this whole file exists to
 * prevent — the user gets no email, the record says "delivered", and nobody
 * finds out until a borrower asks why their collateral was sold.
 *
 * Registered rather than omitted so `/ready` and `notify.channels` can say
 * "email exists and is not wired" instead of email simply not appearing.
 */
export class UnconfiguredChannel implements NotificationChannel {
  readonly unavailableReason: RefusalCode = 'channel.not_configured';

  constructor(
    readonly channel: ChannelId,
    /** The env vars the owner must set. Reported verbatim — this is an ops instruction. */
    readonly missingEnv: readonly string[],
  ) {}

  async deliver(): Promise<DeliveryReceipt> {
    throw new ChannelRefusal(this.channel, 'channel.not_configured', `set ${this.missingEnv.join(' and ')}`);
  }
}

/**
 * The in-app inbox as a channel.
 *
 * The row is already written by the time the dispatcher runs — the inbox insert
 * is what created the notification. So this reports delivered and references the
 * row, which is true: the message is in the user's inbox and retrievable.
 *
 * "Delivered" here does not mean "read". `notifications.read_at` is the read
 * signal and it is a different column for the same reason `notified_at` is a
 * different column from `called_at`.
 */
export class InAppChannel implements NotificationChannel {
  readonly channel = 'inapp' as const;
  readonly unavailableReason: RefusalCode | null = null;

  async deliver(message: OutboundMessage): Promise<DeliveryReceipt> {
    return { reference: message.notificationId };
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

/** A gateway may return an id. It may not. Neither is an error. */
async function readReference(response: Response): Promise<string | null> {
  const text = await response.text().catch(() => '');
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'id' in parsed) {
      const id = (parsed as { id: unknown }).id;
      if (typeof id === 'string') return id;
      if (typeof id === 'number') return String(id);
    }
  } catch {
    // Not JSON. The transport accepted it; that is what we needed to know.
  }
  return null;
}
