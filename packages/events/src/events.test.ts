import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { subject, parseSubject, assertValidSubject, InvalidSubjectError, wildcard, streamName } from './subject.js';
import { ALL_EVENTS, EVENT_CATALOG, WIRING_SOCKETS, wiringSocketReason } from './catalog.js';
import { MemoryEventBus } from './memory-bus.js';
import {
  EventSchemaDriftError,
  EventValidationError,
  EventVersionMismatchError,
  MemorySeenStore,
  acceptEnvelope,
  droppedPaths,
  idempotent,
  validatePayload,
} from './bus.js';
import { createEnvelope, decodeEnvelope, encodeEnvelope, type Envelope } from './envelope.js';

describe('§10 subject law: intafaced.<service>.<entity>.<verb>', () => {
  it('builds a valid subject', () => {
    expect(subject('ledger', 'tx', 'posted')).toBe('intafaced.ledger.tx.posted');
  });

  it('rejects an unregistered service', () => {
    expect(() => assertValidSubject('intafaced.nonsense.tx.posted')).toThrow(InvalidSubjectError);
  });

  it('rejects a present-tense verb — events are facts, not commands', () => {
    expect(() => assertValidSubject('intafaced.ledger.tx.post')).toThrow(InvalidSubjectError);
  });

  it('rejects the wrong token count', () => {
    expect(() => assertValidSubject('intafaced.ledger.posted')).toThrow(InvalidSubjectError);
    expect(() => assertValidSubject('intafaced.ledger.tx.entry.posted')).toThrow(InvalidSubjectError);
  });

  it('rejects a bad prefix', () => {
    expect(() => assertValidSubject('other.ledger.tx.posted')).toThrow(InvalidSubjectError);
  });

  it('parses back to its parts', () => {
    expect(parseSubject('intafaced.trade.order.filled')).toMatchObject({
      service: 'trade',
      entity: 'order',
      verb: 'filled',
    });
  });

  it('produces consumer wildcards and stream names', () => {
    expect(wildcard('ledger')).toBe('intafaced.ledger.>');
    expect(wildcard('trade', 'order')).toBe('intafaced.trade.order.*');
    expect(streamName('mining-pool')).toBe('INTAFACED_MINING_POOL');
  });
});

describe('event catalog', () => {
  it('every declared event has a legal subject', () => {
    for (const def of ALL_EVENTS) {
      expect(() => assertValidSubject(def.subject)).not.toThrow();
    }
  });

  it('has no duplicate subjects', () => {
    const subjects = ALL_EVENTS.map((e) => e.subject);
    expect(new Set(subjects).size).toBe(subjects.length);
  });

  it('starts every payload at version 1 or higher', () => {
    for (const def of ALL_EVENTS) expect(def.version).toBeGreaterThanOrEqual(1);
  });

  it('rejects float amounts on money events — decimals are strings', () => {
    expect(() =>
      validatePayload('ledgerTxPosted', {
        txId: crypto.randomUUID(),
        module: 'trade',
        reason: 'trade.fill',
        hash: 'abc',
        previousHash: null,
        entries: [
          { accountId: crypto.randomUUID(), assetId: 'USDT', direction: 'debit', amount: 10.5 },
          { accountId: crypto.randomUUID(), assetId: 'USDT', direction: 'credit', amount: '10.5' },
        ],
        postedAt: new Date().toISOString(),
      }),
    ).toThrow(EventValidationError);
  });

  it('carries a margin call as a fact about a loan, not a claim that anyone was told', () => {
    const payload = validatePayload('bankMarginCalled', {
      loanId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      sequence: 3,
      ltvBps: 8_200,
      cureCollateralAmount: '0.041500000000000000',
      collateralAssetId: 'BTC',
      calledAt: new Date().toISOString(),
      graceExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    // The cure amount is a decimal string end to end — never a number.
    expect(payload.cureCollateralAmount).toBe('0.041500000000000000');
    expect(EVENT_CATALOG.bankMarginCalled.subject).toBe('intafaced.bank.margin_call.created');
    // Nothing on this payload asserts delivery. Delivery is svc-notify's record.
    expect(Object.keys(payload)).not.toContain('notifiedAt');
  });

  it('rejects a margin call with a float cure amount or a zeroth sequence', () => {
    const base = {
      loanId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      sequence: 1,
      ltvBps: 8_200,
      cureCollateralAmount: '0.0415',
      collateralAssetId: 'BTC',
      calledAt: new Date().toISOString(),
      graceExpiresAt: new Date().toISOString(),
    };
    expect(() => validatePayload('bankMarginCalled', { ...base, cureCollateralAmount: 0.0415 })).toThrow(EventValidationError);
    // Sequence starts at 1: a call numbered 0 would collide with "no call yet".
    expect(() => validatePayload('bankMarginCalled', { ...base, sequence: 0 })).toThrow(EventValidationError);
  });

  it('accepts 18-decimal precision', () => {
    const payload = validatePayload('stakeCreated', {
      stakeId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      amount: '1234.123456789012345678',
      tier: 'm12',
      unlocksAt: new Date().toISOString(),
    });
    expect(payload.amount).toBe('1234.123456789012345678');
  });

  it('accepts a futures positionUpdated with decimal-string money fields', () => {
    const payload = validatePayload('positionUpdated', {
      positionId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      marketId: 'btc-usdt-perp',
      symbol: 'BTC/USDT:USDT',
      status: 'open',
      side: 'long',
      contracts: '1.250000000000000000',
      entryPrice: '64000.5',
      markPrice: '64110',
      notional: '80137.5',
      leverage: '5',
      collateral: '16027.5',
      unrealizedPnl: '137.5',
      realizedPnl: '0',
      liquidationPrice: '52000',
      marginMode: 'cross',
      fundingPaid: '-0.004000000000000000',
      ts: new Date().toISOString(),
    });
    expect(EVENT_CATALOG.positionUpdated.subject).toBe('intafaced.trade.position.updated');
    expect(payload.contracts).toBe('1.250000000000000000');
    expect(() =>
      validatePayload('positionUpdated', {
        ...payload,
        contracts: 1.25,
      }),
    ).toThrow(EventValidationError);
  });
});

describe('bus', () => {
  it('validates on publish and refuses a malformed payload', async () => {
    const bus = new MemoryEventBus('svc-identity');
    await expect(
      // @ts-expect-error — deliberately wrong shape
      bus.publish('xpEarned', { userId: 'not-a-uuid', xpDelta: 'lots' }),
    ).rejects.toThrow(EventValidationError);
  });

  it('delivers a valid payload to subscribers', async () => {
    const bus = new MemoryEventBus('svc-trade');
    const seen: number[] = [];
    await bus.subscribe('xpEarned', (p) => void seen.push(p.xpDelta), { durable: 'rank-recalc' });

    await bus.publish('xpEarned', {
      userId: crypto.randomUUID(),
      sourceModule: 'trade',
      action: 'order.filled',
      xpDelta: 25,
    });

    expect(seen).toEqual([25]);
    expect(bus.emitted('xpEarned')).toHaveLength(1);
  });

  it('stamps a complete envelope', async () => {
    const bus = new MemoryEventBus('svc-ledger');
    const env = await bus.publish(
      'xpEarned',
      { userId: crypto.randomUUID(), sourceModule: 'p2p', action: 'trade.completed', xpDelta: 10 },
      { idempotencyKey: 'p2p-trade-42', correlationId: 'corr-1' },
    );
    expect(env.subject).toBe(EVENT_CATALOG.xpEarned.subject);
    expect(env.producer).toBe('svc-ledger');
    expect(env.idempotencyKey).toBe('p2p-trade-42');
    expect(env.correlationId).toBe('corr-1');
    expect(env.version).toBe(1);
    expect(() => new Date(env.occurredAt).toISOString()).not.toThrow();
  });

  it('round-trips an envelope through the wire codec', async () => {
    const bus = new MemoryEventBus('svc-ledger');
    const env = await bus.publish('userCreated', { userId: crypto.randomUUID(), handle: 'sovereign' });
    const decoded = decodeEnvelope(encodeEnvelope(env));
    expect(decoded).toEqual(env);
  });

  it('rejects a corrupted envelope on decode', () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ id: 'nope', subject: 'x' }));
    expect(() => decodeEnvelope(bytes)).toThrow(/Malformed event envelope/);
  });
});

describe('schema drift: the bus refuses rather than strips', () => {
  const fill = (extra: Record<string, unknown> = {}) => ({
    marketId: 'btc-usdt',
    makerOrderId: crypto.randomUUID(),
    takerOrderId: crypto.randomUUID(),
    price: '64000.5',
    qty: '0.25',
    sequence: 41,
    ts: new Date().toISOString(),
    ...extra,
  });

  /**
   * THE DISEASE, demonstrated on plain zod so nobody has to take it on faith.
   *
   * This is what every consumer in this repo used to do with every payload, and
   * it is the whole of the `orderFilled` incident: an account id arrives, the
   * schema does not know the key, `success` is true, and the id is gone. No
   * throw, no log, no counter — the only evidence is a field that was there on
   * one side of the bus and not the other.
   */
  it('zod strips an unknown key silently — success: true, field gone', () => {
    const staleSchema = z.object({ marketId: z.string(), qty: z.string() });
    const result = staleSchema.safeParse({ marketId: 'btc-usdt', qty: '0.25', makerAccountId: 'house:market-maker' });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('makerAccountId');
    // Nothing anywhere records that a field was dropped. That is the bug.
    expect(Object.keys(result.data!)).toEqual(['marketId', 'qty']);
  });

  it('refuses the payload instead, naming the dropped field and the producer', () => {
    expect(() => validatePayload('orderFilled', fill({ settlementAccountId: 'acct-1' }), 'svc-matching')).toThrow(
      EventSchemaDriftError,
    );

    try {
      validatePayload('orderFilled', fill({ settlementAccountId: 'acct-1' }), 'svc-matching');
      expect.unreachable('drift must not pass');
    } catch (err) {
      const drift = err as EventSchemaDriftError;
      expect(drift.dropped).toEqual(['settlementAccountId']);
      // An error that says "somebody is stale" is a search. This one is a fix.
      expect(drift.message).toContain('svc-matching');
      expect(drift.message).toContain('settlementAccountId');
      expect(drift.message).toContain('intafaced.matching.order.filled');
    }
  });

  /**
   * The expensive shape. `entries[].accountId` is a double-entry line naming
   * whose money moved; a top-level-only check would call this payload clean.
   */
  it('catches a money-adjacent id dropped from INSIDE an array', () => {
    const entry = { accountId: crypto.randomUUID(), assetId: 'USDT', direction: 'debit' as const, amount: '10.00' };
    const posted = {
      txId: crypto.randomUUID(),
      module: 'trade',
      reason: 'trade.fill',
      hash: 'h1',
      previousHash: null,
      entries: [entry, { ...entry, direction: 'credit' as const, subAccountId: 'sub-7' }],
      postedAt: new Date().toISOString(),
    };

    try {
      validatePayload('ledgerTxPosted', posted, 'svc-ledger');
      expect.unreachable('nested drift must not pass');
    } catch (err) {
      expect(err).toBeInstanceOf(EventSchemaDriftError);
      expect((err as EventSchemaDriftError).dropped).toEqual(['entries[1].subAccountId']);
    }
  });

  it('reports every dropped path, not just the first', () => {
    expect(droppedPaths({ a: 1, b: { c: 2, d: 3 } }, { a: 1, b: { c: 2 } })).toEqual(['b.d']);
    expect(droppedPaths({ a: 1, b: 2 }, {})).toEqual(['a', 'b']);
  });

  // The other half of not crying wolf. Every one of these is a payload that
  // must keep working, and a drift check that fired on any of them would be
  // switched off within a day.
  it('does not fire on anything legitimate', () => {
    // Optional fields present.
    expect(() =>
      validatePayload('orderFilled', fill({ makerAccountId: 'house:market-maker', takerAccountId: crypto.randomUUID() })),
    ).not.toThrow();
    // Optional fields absent.
    expect(() => validatePayload('orderFilled', fill())).not.toThrow();
    // An explicit `undefined` is not a field the wire ever carried.
    expect(() => validatePayload('orderFilled', fill({ makerAccountId: undefined }))).not.toThrow();
    // A nullable field that is null.
    expect(() => validatePayload('orderUpdated', {
      orderId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      marketId: 'btc-usdt',
      status: 'open',
      side: 'buy',
      type: 'limit',
      qty: '1',
      filledQty: '0',
      price: null,
      clientOrderId: null,
      ts: new Date().toISOString(),
    })).not.toThrow();
    // `z.record(z.unknown())` is a declared open bag — its keys are not drift.
    expect(() =>
      validatePayload('xpEarned', {
        userId: crypto.randomUUID(),
        sourceModule: 'p2p',
        action: 'trade.completed',
        xpDelta: 10,
        meta: { tradeId: 'abc', anythingAtAll: { nested: true } },
      }),
    ).not.toThrow();
  });

  it('refuses on the wire too — a consumer never receives a stripped payload', async () => {
    const bus = new MemoryEventBus('svc-matching');
    const handler = vi.fn();
    await bus.subscribe('orderFilled', handler, { durable: 'drift-test' });

    await expect(bus.publish('orderFilled', fill({ settlementAccountId: 'acct-1' }) as never)).rejects.toThrow(
      EventSchemaDriftError,
    );
    // Refused at the producer, so nothing was delivered half-formed either.
    expect(handler).not.toHaveBeenCalled();
  });

  /**
   * VERSION IS NOT THE ANSWER TO THIS, and the test says so out loud.
   *
   * The envelope has carried a `version` all along and the consume path never
   * looked at it. It does now — but `makerAccountId` was added as `.optional()`
   * at version 1, correctly, because the change was additive. So a version
   * comparison would have found the two sides in perfect agreement while one of
   * them was deleting a field the other sent. Version catches a DECLARED break;
   * drift catches an UNDECLARED one, and the undeclared one is the bug that cost
   * a day.
   */
  it('detects a version mismatch — which would NOT have caught the orderFilled bug', () => {
    const ahead = createEnvelope({
      subject: EVENT_CATALOG.orderFilled.subject,
      version: EVENT_CATALOG.orderFilled.version + 1,
      producer: 'svc-matching',
      idempotencyKey: 'k1',
      payload: fill(),
    }) as Envelope;

    expect(() => acceptEnvelope('orderFilled', ahead)).toThrow(EventVersionMismatchError);

    // Same fields, same version, one key this build does not know: version says
    // nothing, drift is the only thing that speaks.
    const same = createEnvelope({
      subject: EVENT_CATALOG.orderFilled.subject,
      version: EVENT_CATALOG.orderFilled.version,
      producer: 'svc-matching',
      idempotencyKey: 'k2',
      payload: fill({ makerAccountId: 'house:market-maker', settlementAccountId: 'acct-1' }),
    }) as Envelope;

    expect(() => acceptEnvelope('orderFilled', same)).not.toThrow(EventVersionMismatchError);
    expect(() => acceptEnvelope('orderFilled', same)).toThrow(EventSchemaDriftError);
  });
});

describe('declared wiring sockets', () => {
  it('names only events that exist — a socket cannot outlive its event', () => {
    for (const socket of WIRING_SOCKETS) expect(EVENT_CATALOG).toHaveProperty(socket.event);
  });

  it('carries a reason substantial enough to be one', () => {
    for (const socket of WIRING_SOCKETS) {
      expect(socket.reason.trim().length, `${socket.event}/${socket.missing}`).toBeGreaterThanOrEqual(40);
      expect(socket.reason, `${socket.event}/${socket.missing}`).not.toMatch(/^(TODO|TBD|later|n\/a)/i);
    }
  });

  it('records at most one reason per end', () => {
    const keys = WIRING_SOCKETS.map((s) => `${s.event}::${s.missing}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  /**
   * The two findings, pinned. If either of these ends gets wired, the assertion
   * fails and the socket entry has to go with it — which is exactly the point:
   * a socket must not outlive the gap it describes.
   */
  it('still records the two findings that started this', () => {
    expect(wiringSocketReason('bankMarginCalled', 'publisher')).toContain('svc-bank');
    expect(wiringSocketReason('xpEarned', 'subscriber')).toContain('svc-identity');
    // And says nothing about ends that are wired.
    expect(wiringSocketReason('bankMarginCalled', 'subscriber')).toBeNull();
    expect(wiringSocketReason('orderFilled', 'publisher')).toBeNull();
  });
});

describe('§10 consumer idempotency', () => {
  it('processes a redelivered envelope exactly once', async () => {
    const bus = new MemoryEventBus('svc-identity');
    const store = new MemorySeenStore();
    const handler = vi.fn();
    await bus.subscribe('xpEarned', idempotent(handler, store, 'rank-recalc'), { durable: 'rank-recalc' });

    const payload = { userId: crypto.randomUUID(), sourceModule: 'academy', action: 'cert.earned', xpDelta: 500 };
    await bus.publish('xpEarned', payload, { idempotencyKey: 'cert-99' });
    await bus.publish('xpEarned', payload, { idempotencyKey: 'cert-99' });
    await bus.publish('xpEarned', payload, { idempotencyKey: 'cert-100' });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('scopes dedupe per consumer, so two consumers each see the event', async () => {
    const bus = new MemoryEventBus('svc-identity');
    const store = new MemorySeenStore();
    const a = vi.fn();
    const b = vi.fn();
    await bus.subscribe('xpEarned', idempotent(a, store, 'rank-recalc'), { durable: 'rank-recalc' });
    await bus.subscribe('xpEarned', idempotent(b, store, 'xp-analytics'), { durable: 'xp-analytics' });

    await bus.publish(
      'xpEarned',
      { userId: crypto.randomUUID(), sourceModule: 'trade', action: 'order.filled', xpDelta: 5 },
      { idempotencyKey: 'fill-1' },
    );

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
