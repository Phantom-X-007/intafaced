import { describe, expect, it } from 'vitest';
import { fingerprintRequest, MemoryRestIdempotencyStore } from './rest-idempotency.js';

describe('fingerprintRequest', () => {
  it('is stable under key reordering', () => {
    const a = fingerprintRequest('POST', '/api/pay/v1/payments', { amount: '1.1', merchantId: 'm' });
    const b = fingerprintRequest('POST', '/api/pay/v1/payments', { merchantId: 'm', amount: '1.1' });
    expect(a).toBe(b);
  });

  it('changes when the body changes', () => {
    const a = fingerprintRequest('POST', '/p', { amount: '1.1' });
    const b = fingerprintRequest('POST', '/p', { amount: '2.0' });
    expect(a).not.toBe(b);
  });
});

describe('MemoryRestIdempotencyStore', () => {
  it('replays a settled claim with the same fingerprint', async () => {
    const store = new MemoryRestIdempotencyStore();
    const fp = fingerprintRequest('POST', '/p', { a: 1 });

    expect(await store.claim('owner', 'key-1', fp)).toEqual({ kind: 'mine' });
    await store.put('owner', 'key-1', { statusCode: 200, body: { ok: true } });

    expect(await store.claim('owner', 'key-1', fp)).toEqual({
      kind: 'replay',
      record: { statusCode: 200, body: { ok: true } },
    });
  });

  it('conflicts when the fingerprint differs', async () => {
    const store = new MemoryRestIdempotencyStore();
    const fp1 = fingerprintRequest('POST', '/p', { a: 1 });
    const fp2 = fingerprintRequest('POST', '/p', { a: 2 });

    expect(await store.claim('owner', 'key-2', fp1)).toEqual({ kind: 'mine' });
    await store.put('owner', 'key-2', { statusCode: 200, body: { ok: true } });

    expect(await store.claim('owner', 'key-2', fp2)).toEqual({ kind: 'conflict' });
  });

  it('abandons a pending claim so a retry may execute', async () => {
    const store = new MemoryRestIdempotencyStore();
    const fp = fingerprintRequest('POST', '/p', {});

    expect(await store.claim('owner', 'key-3', fp)).toEqual({ kind: 'mine' });
    await store.abandon('owner', 'key-3');
    expect(await store.claim('owner', 'key-3', fp)).toEqual({ kind: 'mine' });
  });
});
