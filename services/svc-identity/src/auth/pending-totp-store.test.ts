import { describe, expect, it } from 'vitest';
import { MemoryPendingTotpEnrolmentStore } from './pending-totp-store.js';

describe('MemoryPendingTotpEnrolmentStore', () => {
  it('takeIfSecretHash is single-use on match', async () => {
    const store = new MemoryPendingTotpEnrolmentStore();
    await store.put('user-1', 'hash-secret', ['rec-a', 'rec-b']);
    const first = await store.takeIfSecretHash('user-1', 'hash-secret');
    expect(first?.recoveryHashes).toEqual(['rec-a', 'rec-b']);
    expect(await store.takeIfSecretHash('user-1', 'hash-secret')).toBeNull();
    expect(store.size).toBe(0);
  });

  it('wrong secret leaves the row for a later match', async () => {
    const store = new MemoryPendingTotpEnrolmentStore();
    await store.put('user-1', 'hash-secret', ['rec-a']);
    expect(await store.takeIfSecretHash('user-1', 'wrong')).toBeNull();
    expect(store.size).toBe(1);
    const ok = await store.takeIfSecretHash('user-1', 'hash-secret');
    expect(ok?.recoveryHashes).toEqual(['rec-a']);
  });

  it('put overwrites prior pending for the same user', async () => {
    const store = new MemoryPendingTotpEnrolmentStore();
    await store.put('user-1', 'old-hash', ['old']);
    await store.put('user-1', 'new-hash', ['new']);
    expect(await store.takeIfSecretHash('user-1', 'old-hash')).toBeNull();
    const ok = await store.takeIfSecretHash('user-1', 'new-hash');
    expect(ok?.recoveryHashes).toEqual(['new']);
  });

  it('expired rows are not taken', async () => {
    const store = new MemoryPendingTotpEnrolmentStore();
    await store.put('user-1', 'hash-secret', ['rec-a'], 1);
    await new Promise((r) => setTimeout(r, 5));
    expect(await store.takeIfSecretHash('user-1', 'hash-secret')).toBeNull();
  });
});
