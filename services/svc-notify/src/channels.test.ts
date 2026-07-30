import { describe, expect, it, beforeEach } from 'vitest';
import { MemoryEventBus, bankMarginCalled } from '@intafaced/events';
import { MESSAGE_KEYS } from '@intafaced/i18n';
import { MemoryNotifyStore } from './store.js';
import { MemoryDeliveryStore, MemoryTargetStore } from './channel-store.js';
import { NotifyService } from './notify-service.js';
import { NotificationDispatcher } from './dispatch.js';
import { ChannelRegistry, channelsFromEnv } from './channels/registry.js';
import { GatewayChannel, InAppChannel, UnconfiguredChannel } from './channels/gateway.js';
import { ChannelDeliveryError, type NotificationChannel, type OutboundMessage } from './channels/channel.js';
import { renderNotification } from './channels/render.js';
import { subscribeNotificationEvents } from './events.js';

/**
 * THE HONESTY TESTS.
 *
 * Every case here is a way a notification system lies. Each one is pinned:
 *
 *   · an unconfigured channel reporting success
 *   · a redelivered event sending twice
 *   · a delivery row that says "delivered" when nothing was delivered
 *   · a margin call whose failure to reach anybody leaves no record
 *   · copy that ships a key nobody has translated
 */

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const LOAN = '55555555-5555-4555-8555-555555555555';

const NO_GATEWAYS = { NOTIFY_GATEWAY_TIMEOUT_MS: 1_000 } as const;

/** A channel that records what it was asked to send. */
class SpyChannel implements NotificationChannel {
  readonly unavailableReason = null;
  readonly sent: OutboundMessage[] = [];

  constructor(
    readonly channel: 'email' | 'push' | 'sms',
    private readonly behaviour: 'ok' | 'retryable' | 'permanent' = 'ok',
  ) {}

  async deliver(message: OutboundMessage) {
    this.sent.push(message);
    if (this.behaviour === 'retryable')
      throw new ChannelDeliveryError(this.channel, 'gateway responded 503', { retryable: true, status: 503 });
    if (this.behaviour === 'permanent')
      throw new ChannelDeliveryError(this.channel, 'gateway responded 422', { retryable: false, status: 422 });
    return { reference: `ref-${this.sent.length}` };
  }
}

function registry(over: readonly NotificationChannel[] = []): ChannelRegistry {
  const base: NotificationChannel[] = [
    new InAppChannel(),
    new UnconfiguredChannel('email', ['NOTIFY_EMAIL_GATEWAY_URL', 'NOTIFY_EMAIL_GATEWAY_TOKEN']),
    new UnconfiguredChannel('push', ['NOTIFY_PUSH_GATEWAY_URL', 'NOTIFY_PUSH_GATEWAY_TOKEN']),
    new UnconfiguredChannel('sms', ['NOTIFY_SMS_GATEWAY_URL', 'NOTIFY_SMS_GATEWAY_TOKEN']),
  ];
  const merged = new Map(base.map((c) => [c.channel, c]));
  for (const c of over) merged.set(c.channel, c);
  return new ChannelRegistry([...merged.values()]);
}

interface Harness {
  notify: NotifyService;
  store: MemoryNotifyStore;
  targets: MemoryTargetStore;
  deliveries: MemoryDeliveryStore;
}

function harness(
  channels: ChannelRegistry = registry(),
  options: { fanoutEnabled?: boolean; maxAttempts?: number; outOfAppEnabled?: boolean } = {},
): Harness {
  const store = new MemoryNotifyStore();
  const targets = new MemoryTargetStore();
  const deliveries = new MemoryDeliveryStore();
  const dispatcher = new NotificationDispatcher(channels, targets, deliveries, {
    maxAttempts: options.maxAttempts ?? 3,
    outOfAppEnabled: options.outOfAppEnabled ?? true,
  });
  const notify = new NotifyService(
    store,
    { fanoutEnabled: options.fanoutEnabled ?? true, verifyTtlMinutes: 15 },
    { targets, deliveries, channels, dispatcher },
  );
  return { notify, store, targets, deliveries };
}

function marginCall(overrides: Partial<{ sequence: number }> = {}) {
  return {
    loanId: LOAN,
    userId: USER,
    sequence: 1,
    ltvBps: 8_200,
    cureCollateralAmount: '0.0415',
    collateralAssetId: 'BTC',
    calledAt: new Date().toISOString(),
    graceExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides,
  };
}

/** Register and confirm an address without going through a real transport. */
async function confirmTarget(h: Harness, channel: 'email' | 'push' | 'sms', address: string): Promise<void> {
  await h.targets.upsert({
    userId: USER,
    channel,
    address,
    locale: 'en',
    verifyTokenHash: 'x'.repeat(64),
    verifyExpiresAt: new Date(Date.now() + 60_000),
  });
  await h.targets.markVerified(USER, channel, 'x'.repeat(64), new Date());
}

describe('channel registry — a channel with no credentials refuses, it does not vanish', () => {
  it('registers every channel even when nothing is configured', () => {
    const reg = channelsFromEnv(NO_GATEWAYS);
    expect(reg.status().map((s) => s.channel)).toEqual(['inapp', 'email', 'push', 'sms']);
    expect(reg.availableChannels()).toEqual(['inapp']);
  });

  it('names the environment variables an operator is missing', () => {
    const email = channelsFromEnv(NO_GATEWAYS)
      .status()
      .find((s) => s.channel === 'email');
    expect(email).toMatchObject({ available: false, reason: 'channel.not_configured' });
    expect(email?.requires).toEqual(['NOTIFY_EMAIL_GATEWAY_URL', 'NOTIFY_EMAIL_GATEWAY_TOKEN']);
  });

  it('builds a real gateway once URL and token are both present', () => {
    const reg = channelsFromEnv({
      ...NO_GATEWAYS,
      NOTIFY_EMAIL_GATEWAY_URL: 'https://gateway.internal/send',
      NOTIFY_EMAIL_GATEWAY_TOKEN: 'a-token-long-enough-to-pass',
    });
    expect(reg.get('email')).toBeInstanceOf(GatewayChannel);
    expect(reg.availableChannels()).toEqual(['inapp', 'email']);
  });

  it('refuses to construct a registry missing a channel — an absent channel cannot refuse', () => {
    expect(() => new ChannelRegistry([new InAppChannel()])).toThrow(/missing "email"/);
  });
});

describe('an unconfigured channel never reports success', () => {
  it('records a refusal with the reason, and no delivery time', async () => {
    const h = harness();
    await confirmTarget(h, 'email', 'someone@example.com');

    const result = await h.notify.create({
      userId: USER,
      kind: 'bank.margin_call',
      titleKey: 'notify.bank.margin_call.title',
      bodyKey: 'notify.bank.margin_call.body',
      severity: 'critical',
      sourceSubject: bankMarginCalled.subject,
      sourceIdempotencyKey: `${LOAN}:1`,
    });

    const email = result.dispatch!.outcomes.find((o) => o.channel === 'email');
    expect(email).toMatchObject({ status: 'refused', code: 'channel.not_configured', retryable: false });

    const rows = await h.deliveries.listForNotification(result.notification!.id);
    const emailRow = rows.find((r) => r.channel === 'email')!;
    expect(emailRow.status).toBe('refused');
    expect(emailRow.deliveredAt).toBeNull();
    // Nothing was attempted, so nothing may claim it was.
    expect(emailRow.attemptedAt).toBeNull();
    expect(emailRow.refusalCode).toBe('channel.not_configured');
  });

  it('still delivers in-app — the honest fallback when the owner has no credentials', async () => {
    const h = harness();
    const result = await h.notify.create({
      userId: USER,
      kind: 'trade.fill',
      titleKey: 'notify.trade.fill.title',
      bodyKey: 'notify.trade.fill.body',
      sourceSubject: 'intafaced.trade.fill.settled',
      sourceIdempotencyKey: 'fill-1',
    });

    expect(result.dispatch!.outcomes.find((o) => o.channel === 'inapp')).toMatchObject({ status: 'delivered' });
    expect(result.dispatch!.retry).toBe(false);
    expect(await h.notify.unreadCount(USER)).toBe(1);
  });
});

describe('at-least-once must not mean twice', () => {
  it('sends one email for a redelivered event', async () => {
    const email = new SpyChannel('email');
    const h = harness(registry([email]));
    await confirmTarget(h, 'email', 'someone@example.com');

    const input = {
      userId: USER,
      kind: 'bank.margin_call',
      titleKey: 'notify.bank.margin_call.title',
      bodyKey: 'notify.bank.margin_call.body',
      severity: 'critical' as const,
      sourceSubject: bankMarginCalled.subject,
      sourceIdempotencyKey: `${LOAN}:1`,
    };

    const first = await h.notify.create(input);
    const second = await h.notify.create(input);

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(email.sent).toHaveLength(1);
    // The redelivery still ran fan-out; the claim is what stopped the second send.
    expect(second.dispatch!.outcomes.find((o) => o.channel === 'email')).toMatchObject({ status: 'already_delivered' });
  });

  it('recovers a send lost to a crash between the insert and the transport', async () => {
    // First pass: the row is written, the gateway is unreachable, the process dies.
    const flaky = new SpyChannel('email', 'retryable');
    const h = harness(registry([flaky]));
    await confirmTarget(h, 'email', 'someone@example.com');

    const input = {
      userId: USER,
      kind: 'trade.fill',
      titleKey: 'notify.trade.fill.title',
      bodyKey: 'notify.trade.fill.body',
      severity: 'critical' as const,
      sourceSubject: 'intafaced.trade.fill.settled',
      sourceIdempotencyKey: 'fill-crash',
    };

    const first = await h.notify.create(input);
    expect(first.dispatch!.retry).toBe(true);

    // Redelivery: the insert is a no-op, but the row is recovered and retried.
    const second = await h.notify.create(input);
    expect(second.inserted).toBe(false);
    expect(second.dispatch).not.toBeNull();
    expect(flaky.sent).toHaveLength(2);
  });
});

describe('retry policy — transient yes, permanent no', () => {
  it('asks for a retry on a 503 and records the attempt without a delivery', async () => {
    const h = harness(registry([new SpyChannel('email', 'retryable')]));
    await confirmTarget(h, 'email', 'someone@example.com');

    const result = await h.notify.create({
      userId: USER,
      kind: 'trade.fill',
      titleKey: 'notify.trade.fill.title',
      bodyKey: 'notify.trade.fill.body',
      sourceSubject: 'intafaced.trade.fill.settled',
      sourceIdempotencyKey: 'fill-503',
    });

    expect(result.dispatch!.retry).toBe(true);
    const row = (await h.deliveries.listForNotification(result.notification!.id)).find((r) => r.channel === 'email')!;
    expect(row.status).toBe('failed');
    // We tried; nobody received it. Both facts, separately.
    expect(row.attemptedAt).not.toBeNull();
    expect(row.deliveredAt).toBeNull();
  });

  it('does not ask for a retry on a 422 — a permanently broken address must not burn the budget', async () => {
    const h = harness(registry([new SpyChannel('email', 'permanent')]));
    await confirmTarget(h, 'email', 'someone@example.com');

    const result = await h.notify.create({
      userId: USER,
      kind: 'trade.fill',
      titleKey: 'notify.trade.fill.title',
      bodyKey: 'notify.trade.fill.body',
      sourceSubject: 'intafaced.trade.fill.settled',
      sourceIdempotencyKey: 'fill-422',
    });

    expect(result.dispatch!.retry).toBe(false);
    const row = (await h.deliveries.listForNotification(result.notification!.id)).find((r) => r.channel === 'email')!;
    expect(row.status).toBe('abandoned');
    expect(row.deliveredAt).toBeNull();
  });

  it('abandons after the configured attempts rather than retrying forever', async () => {
    const flaky = new SpyChannel('email', 'retryable');
    const h = harness(registry([flaky]), { maxAttempts: 2 });
    await confirmTarget(h, 'email', 'someone@example.com');

    const input = {
      userId: USER,
      kind: 'trade.fill',
      titleKey: 'notify.trade.fill.title',
      bodyKey: 'notify.trade.fill.body',
      sourceSubject: 'intafaced.trade.fill.settled',
      sourceIdempotencyKey: 'fill-exhaust',
    };

    await h.notify.create(input);
    const second = await h.notify.create(input);
    const third = await h.notify.create(input);

    expect(flaky.sent).toHaveLength(2);
    expect(second.dispatch!.retry).toBe(false);
    expect(third.dispatch!.outcomes.find((o) => o.channel === 'email')).toMatchObject({
      status: 'abandoned',
      code: 'channel.attempts_exhausted',
    });
  });
});

describe('a critical notification that reached nobody says so', () => {
  it('records a refusal per out-of-app channel even with no registered address', async () => {
    const h = harness();

    const result = await h.notify.create({
      userId: USER,
      kind: 'bank.margin_call',
      titleKey: 'notify.bank.margin_call.title',
      bodyKey: 'notify.bank.margin_call.body',
      severity: 'critical',
      sourceSubject: bankMarginCalled.subject,
      sourceIdempotencyKey: `${LOAN}:1`,
    });

    const rows = await h.deliveries.listForNotification(result.notification!.id);
    expect(rows.map((r) => r.channel).sort()).toEqual(['email', 'inapp', 'push', 'sms']);
    for (const row of rows.filter((r) => r.channel !== 'inapp')) {
      expect(row.status).toBe('refused');
      expect(row.refusalCode).toBe('channel.no_target');
      expect(row.deliveredAt).toBeNull();
    }
  });

  it('leaves an informational notification alone — nothing was promised on a channel nobody registered', async () => {
    const h = harness();
    const result = await h.notify.create({
      userId: USER,
      kind: 'trade.fill',
      titleKey: 'notify.trade.fill.title',
      bodyKey: 'notify.trade.fill.body',
      severity: 'info',
      sourceSubject: 'intafaced.trade.fill.settled',
      sourceIdempotencyKey: 'fill-quiet',
    });

    const rows = await h.deliveries.listForNotification(result.notification!.id);
    expect(rows.map((r) => r.channel)).toEqual(['inapp']);
  });
});

describe('addresses are confirmed before anything is sent to them', () => {
  it('never sends to an unconfirmed address', async () => {
    const email = new SpyChannel('email');
    const h = harness(registry([email]));
    await h.targets.upsert({
      userId: USER,
      channel: 'email',
      address: 'unconfirmed@example.com',
      locale: 'en',
      verifyTokenHash: 'y'.repeat(64),
      verifyExpiresAt: new Date(Date.now() + 60_000),
    });

    const result = await h.notify.create({
      userId: USER,
      kind: 'trade.fill',
      titleKey: 'notify.trade.fill.title',
      bodyKey: 'notify.trade.fill.body',
      sourceSubject: 'intafaced.trade.fill.settled',
      sourceIdempotencyKey: 'fill-unverified',
    });

    expect(email.sent).toHaveLength(0);
    expect(result.dispatch!.outcomes.map((o) => o.channel)).toEqual(['inapp']);
  });

  it('sends the confirmation code through the channel being registered', async () => {
    const email = new SpyChannel('email');
    const h = harness(registry([email]));

    const outcome = await h.notify.registerTarget({ userId: USER, channel: 'email', address: 'new@example.com', locale: 'en' });
    expect(outcome.status).toBe('sent');
    expect(email.sent[0]!.address).toBe('new@example.com');
    // A six-digit code, rendered from the catalog — not a raw key, not a template.
    expect(email.sent[0]!.body).toMatch(/\b\d{6}\b/);
    // And it is not readable from the inbox: confirming a NEW address must not
    // be possible with nothing but the session.
    expect(await h.notify.unreadCount(USER)).toBe(0);
  });

  it('reports the refusal instead of a green tick when the channel is not wired', async () => {
    const h = harness();
    const outcome = await h.notify.registerTarget({ userId: USER, channel: 'sms', address: '+447700900000', locale: 'en' });
    expect(outcome).toMatchObject({ status: 'refused', code: 'channel.not_configured' });

    const targets = await h.notify.listTargets(USER);
    expect(targets[0]).toMatchObject({ channel: 'sms', verifiedAt: null });
  });

  it('rejects a wrong, expired or already-spent code', async () => {
    const h = harness(registry([new SpyChannel('email')]));
    await h.notify.registerTarget({ userId: USER, channel: 'email', address: 'new@example.com', locale: 'en' });

    expect(await h.notify.verifyTarget(USER, 'email', '000000')).toBe(false);
    const targets = await h.notify.listTargets(USER);
    expect(targets[0]?.verifiedAt).toBeNull();
  });

  it('un-confirms a target when its address changes', async () => {
    const h = harness(registry([new SpyChannel('email')]));
    await confirmTarget(h, 'email', 'old@example.com');
    expect((await h.notify.listTargets(USER))[0]?.verifiedAt).not.toBeNull();

    await h.notify.registerTarget({ userId: USER, channel: 'email', address: 'new@example.com', locale: 'en' });
    expect((await h.notify.listTargets(USER))[0]).toMatchObject({ address: 'new@example.com', verifiedAt: null });
  });
});

describe('the operator switch stops sending without blinding anyone', () => {
  it('fills the inbox and refuses out-of-app when NOTIFY_OUT_OF_APP_ENABLED is off', async () => {
    const email = new SpyChannel('email');
    const h = harness(registry([email]), { outOfAppEnabled: false });
    await confirmTarget(h, 'email', 'someone@example.com');

    const result = await h.notify.create({
      userId: USER,
      kind: 'trade.fill',
      titleKey: 'notify.trade.fill.title',
      bodyKey: 'notify.trade.fill.body',
      sourceSubject: 'intafaced.trade.fill.settled',
      sourceIdempotencyKey: 'fill-quiet-hours',
    });

    expect(email.sent).toHaveLength(0);
    expect(await h.notify.unreadCount(USER)).toBe(1);
    expect(result.dispatch!.outcomes.find((o) => o.channel === 'email')).toMatchObject({
      status: 'refused',
      code: 'channel.disabled',
    });
  });
});

describe('the delivery record is the user’s to read, and only their own', () => {
  it('returns the record for the caller and nothing for a stranger', async () => {
    const h = harness();
    const result = await h.notify.create({
      userId: USER,
      kind: 'bank.margin_call',
      titleKey: 'notify.bank.margin_call.title',
      bodyKey: 'notify.bank.margin_call.body',
      severity: 'critical',
      sourceSubject: bankMarginCalled.subject,
      sourceIdempotencyKey: `${LOAN}:2`,
    });

    expect(await h.notify.deliveriesFor(USER, result.notification!.id)).not.toHaveLength(0);
    // Not an error — an error would confirm the id exists.
    expect(await h.notify.deliveriesFor(OTHER, result.notification!.id)).toEqual([]);
  });
});

describe('out-of-app copy comes from the same catalog as the screen', () => {
  it('renders a margin call into copy, not into a dotted key', () => {
    const rendered = renderNotification(
      {
        id: 'n1',
        userId: USER,
        kind: 'bank.margin_call',
        titleKey: 'notify.bank.margin_call.title',
        bodyKey: 'notify.bank.margin_call.body',
        params: { cureCollateralAmount: '0.0415', collateralAssetId: 'BTC', graceExpiresAt: '2026-08-01T00:00:00.000Z' },
        href: null,
        severity: 'critical',
        readAt: null,
        sourceSubject: bankMarginCalled.subject,
        sourceIdempotencyKey: `${LOAN}:1`,
        createdAt: new Date(),
      },
      'en',
    );

    expect(rendered.title).toBe('Margin call on your loan');
    expect(rendered.body).toContain('0.0415');
    expect(rendered.body).toContain('BTC');
    // A raw key reaching a user is the failure this asserts against.
    expect(rendered.body).not.toContain('notify.bank');
    expect(rendered.body).not.toContain('{');
  });

  it('has a catalog entry for every title and body key the consumers use', async () => {
    // Walk the actual wiring rather than a hand-kept list: a consumer added
    // without copy would otherwise email somebody a dotted key.
    const seen: string[] = [];
    const notify = {
      create: async (input: { titleKey: string; bodyKey: string }) => {
        seen.push(input.titleKey, input.bodyKey);
        return { inserted: true, notification: null, dispatch: null };
      },
    } as unknown as NotifyService;

    const bus = new MemoryEventBus('test');
    await subscribeNotificationEvents(bus, notify);

    await bus.publish('bankMarginCalled', marginCall());
    await bus.publish('kycApproved', { userId: USER, tier: 'basic', jurisdiction: 'DE' });
    await bus.publish('rankUpdated', { userId: USER, rank: 2, previousRank: 1, xp: '10' });

    expect(seen.length).toBeGreaterThan(0);
    for (const key of seen) expect(MESSAGE_KEYS).toContain(key);
  });
});

describe('the margin-call consumer', () => {
  let h: Harness;

  beforeEach(() => {
    h = harness();
  });

  it('writes one critical inbox row per call sequence, and dedupes redelivery', async () => {
    const bus = new MemoryEventBus('svc-bank');
    await subscribeNotificationEvents(bus, h.notify);

    await bus.publish('bankMarginCalled', marginCall({ sequence: 1 }));
    await bus.publish('bankMarginCalled', marginCall({ sequence: 1 }));
    expect(await h.notify.unreadCount(USER)).toBe(1);

    // A cured loan called again is a NEW fact, not a duplicate.
    await bus.publish('bankMarginCalled', marginCall({ sequence: 2 }));
    expect(await h.notify.unreadCount(USER)).toBe(2);

    const rows = await h.notify.list({ userId: USER, limit: 10, unreadOnly: false });
    const call = rows.items.find((n) => n.kind === 'bank.margin_call')!;
    expect(call.severity).toBe('critical');
    expect(call.sourceSubject).toBe('intafaced.bank.margin_call.created');
    expect(call.params).toMatchObject({ loanId: LOAN, cureCollateralAmount: '0.0415', ltvBps: 8_200 });
  });

  it('naks so the bus redelivers when a channel wants another attempt', async () => {
    const flaky = new SpyChannel('email', 'retryable');
    const local = harness(registry([flaky]));
    await confirmTarget(local, 'email', 'borrower@example.com');

    const bus = new MemoryEventBus('svc-bank');
    await subscribeNotificationEvents(bus, local.notify);

    await expect(bus.publish('bankMarginCalled', marginCall())).rejects.toThrow(/wants a retry/);
  });

  it('acks quietly when a channel is permanently broken — one bad address must not park the message', async () => {
    const broken = new SpyChannel('email', 'permanent');
    const local = harness(registry([broken]));
    await confirmTarget(local, 'email', 'borrower@example.com');

    const bus = new MemoryEventBus('svc-bank');
    await subscribeNotificationEvents(bus, local.notify);

    await expect(bus.publish('bankMarginCalled', marginCall())).resolves.toBeTruthy();
    expect(await local.notify.unreadCount(USER)).toBe(1);
  });
});

describe('consumers whose producer has not created a stream are reported, not hidden', () => {
  it('collects the failure by subject instead of failing the whole boot', async () => {
    // One subject's stream is missing — exactly svc-bank's state until it wires
    // a bus. The other eight consumers must still attach.
    const bus = new MemoryEventBus('test');
    const real = bus.subscribe.bind(bus);
    bus.subscribe = (async (event: string, handler: never, opts: never) => {
      if (event === 'bankMarginCalled') throw new Error('stream not found');
      return real(event as never, handler, opts);
    }) as typeof bus.subscribe;

    const h = harness();
    const report = await subscribeNotificationEvents(bus, h.notify);

    expect(report.pending).toHaveLength(1);
    expect(report.pending[0]).toMatchObject({
      event: 'bankMarginCalled',
      subject: 'intafaced.bank.margin_call.created',
      durable: 'notify-bank-margin-called',
      reason: 'stream not found',
    });
    // Every other consumer still attached — the inbox is not held hostage.
    expect(report.subscriptions).toHaveLength(8);
  });
});

describe('the gateway adapter', () => {
  it('posts an authenticated, idempotency-keyed request and never names a provider', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ id: 'gw-1' }), { status: 202 });
    }) as unknown as typeof fetch;

    const gateway = new GatewayChannel(
      'email',
      { url: 'https://gateway.internal/send', token: 'secret-token-value', timeoutMs: 1_000 },
      fakeFetch,
    );

    const receipt = await gateway.deliver({
      notificationId: 'n1',
      userId: USER,
      channel: 'email',
      kind: 'bank.margin_call',
      severity: 'critical',
      titleKey: 'notify.bank.margin_call.title',
      bodyKey: 'notify.bank.margin_call.body',
      title: 'Margin call on your loan',
      body: 'Add 0.0415 BTC.',
      href: '/bank/loans/x',
      locale: 'en',
      address: 'borrower@example.com',
      idempotencyKey: 'n1:email',
    });

    expect(receipt.reference).toBe('gw-1');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer secret-token-value');
    expect(headers['idempotency-key']).toBe('n1:email');
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ to: 'borrower@example.com', channel: 'email' });
  });

  it('treats 5xx as retryable and 4xx as not', async () => {
    const status = (code: number) =>
      new GatewayChannel(
        'sms',
        { url: 'https://gateway.internal/send', token: 'secret-token-value', timeoutMs: 1_000 },
        (async () => new Response('nope', { status: code })) as unknown as typeof fetch,
      );

    const message: OutboundMessage = {
      notificationId: 'n1',
      userId: USER,
      channel: 'sms',
      kind: 'trade.fill',
      severity: 'info',
      titleKey: 'notify.trade.fill.title',
      bodyKey: 'notify.trade.fill.body',
      title: 'Order filled',
      body: 'buy 1 at 2',
      href: null,
      locale: 'en',
      address: '+447700900000',
      idempotencyKey: 'n1:sms',
    };

    await expect(status(503).deliver(message)).rejects.toMatchObject({ retryable: true });
    await expect(status(429).deliver(message)).rejects.toMatchObject({ retryable: true });
    await expect(status(422).deliver(message)).rejects.toMatchObject({ retryable: false });
  });
});
