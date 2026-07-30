import { describe, expect, it, vi } from 'vitest';
import { subject, parseSubject, assertValidSubject, InvalidSubjectError, wildcard, streamName } from './subject.js';
import { ALL_EVENTS, EVENT_CATALOG } from './catalog.js';
import { MemoryEventBus } from './memory-bus.js';
import { EventValidationError, MemorySeenStore, idempotent, validatePayload } from './bus.js';
import { decodeEnvelope, encodeEnvelope } from './envelope.js';

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
