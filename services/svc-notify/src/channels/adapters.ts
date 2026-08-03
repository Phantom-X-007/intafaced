import { GatewayChannel, truncate, type GatewayConfig } from './gateway.js';
import type { OutboundMessage } from './channel.js';

/**
 * THE THREE OUT-OF-APP ADAPTERS — email, push, SMS.
 *
 * They share a transport (`GatewayChannel`) and differ in the only two places
 * the three transports actually differ:
 *
 *   what an address is    a mailbox, an E.164 number, an opaque device token
 *   what a message is     a subject and a body, a text under a length budget,
 *                         a title plus a data payload the app routes on
 *
 * Everything else — auth, idempotency key, timeout, error mapping, the refusal
 * to follow a redirect — is one implementation in one place, because three
 * copies of retry semantics is three chances to get it wrong.
 *
 * NO PROVIDER IS NAMED HERE OR ANYWHERE BELOW IT (§0.7). Each adapter posts to a
 * URL the owner sets. That is also what makes swapping a provider an env change
 * rather than a release.
 *
 * ADDRESS VALIDATION HAPPENS TWICE, ON PURPOSE
 *
 * `router.ts` validates on registration, because telling a user their number is
 * malformed at the moment they type it is the only useful time to say it. These
 * adapters validate again at send time, because a row can predate a rule, be
 * written by a migration, or arrive from a future caller — and a gateway handed
 * a malformed destination does not fail cleanly. It bills, it sends somewhere,
 * or it 400s three times in a row. The second check costs a regex and turns all
 * of that into a recorded refusal.
 */

/**
 * A mailbox, shallowly.
 *
 * No regex distinguishes a real mailbox from a plausible one — the confirmation
 * code does that, which is why registration always sends one. This rejects only
 * what cannot be a mailbox at all: no `@`, more than one `@`, whitespace, a
 * domain without a dot, or a length beyond what RFC 5321 permits a path to be.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * E.164, and not as a formatting preference.
 *
 * A gateway handed `07700 900000` still sends it somewhere, and which country
 * that somewhere is in is the carrier's guess, not ours. A wrong guess is a
 * margin call delivered to a stranger.
 */
const E164_RE = /^\+[1-9]\d{6,14}$/;

/** Device tokens are opaque. Bounded and free of whitespace is all we may assert. */
const PUSH_TOKEN_RE = /^[\x21-\x7e]{8,4096}$/;

/**
 * EMAIL.
 *
 * Sends `subject` and `text` rather than `title` and `body`, because that is what
 * a mail relay's own vocabulary is and a forwarder should not have to translate.
 * `html` is deliberately absent: this service renders from `@intafaced/i18n`
 * (§9), and a second HTML template would be copy the brand scan never sees
 * (§0.7). A gateway that wants HTML has `titleKey`/`bodyKey` and its own
 * templates.
 */
export class EmailChannel extends GatewayChannel {
  constructor(config: GatewayConfig, fetchImpl?: typeof fetch) {
    super('email', config, fetchImpl);
  }

  protected routeAddress(address: string): string | null {
    const trimmed = address.trim();
    if (trimmed.length > 320 || !EMAIL_RE.test(trimmed)) return null;
    return trimmed;
  }

  protected payload(message: OutboundMessage, to: string): Record<string, unknown> {
    return {
      channel: 'email',
      notificationId: message.notificationId,
      to,
      locale: message.locale,
      severity: message.severity,
      kind: message.kind,
      subject: message.title,
      text: message.body,
      href: message.href,
      titleKey: message.titleKey,
      bodyKey: message.bodyKey,
    };
  }
}

/**
 * PUSH.
 *
 * `data` carries the routing facts the app needs to open the right screen when
 * the notification is tapped. It is separate from `title`/`body` because a push
 * service shows the two and passes through the third, and flattening them would
 * put an internal id in front of a user.
 */
export class PushChannel extends GatewayChannel {
  constructor(config: GatewayConfig, fetchImpl?: typeof fetch) {
    super('push', config, fetchImpl);
  }

  protected routeAddress(address: string): string | null {
    const trimmed = address.trim();
    return PUSH_TOKEN_RE.test(trimmed) ? trimmed : null;
  }

  protected payload(message: OutboundMessage, to: string): Record<string, unknown> {
    return {
      channel: 'push',
      notificationId: message.notificationId,
      to,
      locale: message.locale,
      severity: message.severity,
      kind: message.kind,
      title: message.title,
      body: message.body,
      titleKey: message.titleKey,
      bodyKey: message.bodyKey,
      data: { href: message.href, kind: message.kind, notificationId: message.notificationId },
    };
  }
}

export interface SmsConfig extends GatewayConfig {
  /**
   * Characters before the text is cut.
   *
   * SMS is billed per 160-character segment (70 if the copy is non-GSM, which
   * every locale with accents is). An unbounded body is therefore an unbounded
   * bill, and a margin call is exactly the message a locale might render long.
   */
  readonly maxChars: number;
}

/**
 * SMS.
 *
 * One field, `text`, and a length budget.
 *
 * ON TRUNCATION. Cutting a message is a real loss and it is still the right
 * call here: the alternatives are refusing to send a critical notification
 * because its translation ran long, or handing a carrier an unbounded bill.
 * So the title — which carries the fact — is never cut, the body is, the cut is
 * marked with an ellipsis, and the link survives if there is one, because the
 * point of a truncated SMS is to get the user to the full message. If the title
 * alone exceeds the budget the title is cut too; there is nothing better to do,
 * and a silently empty text would be worse.
 */
export class SmsChannel extends GatewayChannel {
  private readonly maxChars: number;

  constructor(config: SmsConfig, fetchImpl?: typeof fetch) {
    super('sms', config, fetchImpl);
    this.maxChars = config.maxChars;
  }

  protected routeAddress(address: string): string | null {
    const trimmed = address.trim();
    return E164_RE.test(trimmed) ? trimmed : null;
  }

  protected payload(message: OutboundMessage, to: string): Record<string, unknown> {
    return {
      channel: 'sms',
      notificationId: message.notificationId,
      to,
      locale: message.locale,
      severity: message.severity,
      kind: message.kind,
      text: composeSms(message, this.maxChars),
      titleKey: message.titleKey,
      bodyKey: message.bodyKey,
    };
  }
}

/** `title: body href`, cut to budget from the body outwards. Exported for its test. */
export function composeSms(message: Pick<OutboundMessage, 'title' | 'body' | 'href'>, maxChars: number): string {
  const tail = message.href ? ` ${message.href}` : '';
  const head = message.title ? `${message.title}: ` : '';
  const budget = maxChars - head.length - tail.length;

  if (budget <= 0) {
    // The title alone does not fit. Cut it and drop the link — a link the user
    // cannot see the start of is not a link they will follow.
    return truncate(`${message.title}${message.body ? `: ${message.body}` : ''}`, maxChars);
  }

  return `${head}${truncate(message.body, budget)}${tail}`;
}
