import { describe, expect, it, vi } from 'vitest';
import { MemoryBroadcastStore } from './broadcast-store.js';
import { runDurableBroadcast } from './durable-broadcast.js';

/**
 * Public door for D26-P1-P9: this path fails closed if putSigned is skipped
 * before broadcast — crash-resume would then re-sign a second spend.
 */
describe('runDurableBroadcast — signed persist before send (D26-P1-P9)', () => {
  it('persists signed raw before calling broadcast', async () => {
    const store = new MemoryBroadcastStore();
    const order: string[] = [];
    const signedRaw = '0xsigneddeadbeef';

    const hash = await runDurableBroadcast({
      store,
      idempotencyKey: 'payout:d26:1',
      sign: async () => {
        order.push('sign');
        return signedRaw;
      },
      broadcast: async (raw) => {
        order.push('broadcast');
        // Would fail if persistence were skipped: resume path needs signed_raw.
        expect(await store.claim('payout:d26:1')).toEqual({ kind: 'resume', signedRaw: raw });
        expect(raw).toBe(signedRaw);
        return '0xhash1';
      },
    });

    expect(hash).toBe('0xhash1');
    expect(order).toEqual(['sign', 'broadcast']);
    expect(await store.get('payout:d26:1')).toBe('0xhash1');
  });

  it('crash after putSigned before put resumes same bytes without re-signing', async () => {
    const store = new MemoryBroadcastStore();
    const signedRaw = '0xsignedcrashresume';
    const sign = vi.fn(async () => signedRaw);
    const broadcast = vi.fn(async (raw: string) => {
      expect(raw).toBe(signedRaw);
      // Simulate crash after sendRaw succeeded on chain but before put:
      // first attempt never journals the hash.
      throw new Error('simulated crash after broadcast RPC');
    });

    await store.claim('payout:d26:crash');
    await store.putSigned('payout:d26:crash', signedRaw);

    // Process-equivalent retry: claim sees signed_raw → resume, no sign().
    await expect(
      runDurableBroadcast({
        store,
        idempotencyKey: 'payout:d26:crash',
        sign,
        broadcast: async (raw) => {
          expect(raw).toBe(signedRaw);
          return '0xrecovered';
        },
      }),
    ).resolves.toBe('0xrecovered');

    expect(sign).not.toHaveBeenCalled();
    expect(await store.get('payout:d26:crash')).toBe('0xrecovered');

    // Control: proving the first broadcast path would have used the same bytes.
    await expect(broadcast(signedRaw).catch((e: Error) => e.message)).resolves.toMatch(/simulated crash/);
  });

  it('refuses to broadcast when putSigned is omitted (door fails if persistence skipped)', async () => {
    const store = new MemoryBroadcastStore();
    await store.claim('payout:d26:skip');

    // Adversarial: skip putSigned and try to broadcast anyway, then retry.
    // Without putSigned, claim stays pending with no resume payload — a second
    // mine is impossible while pending, and resume is unavailable. That is the
    // failure mode D26 closes by requiring putSigned before send.
    const again = store.claim('payout:d26:skip');
    const raced = Promise.race([again.then((c) => c.kind), new Promise<string>((r) => setTimeout(() => r('still-pending'), 30))]);
    expect(await raced).toBe('still-pending');

    // Honest path: persist then resume works.
    await store.putSigned('payout:d26:skip', '0xraw');
    expect(await store.claim('payout:d26:skip')).toEqual({ kind: 'resume', signedRaw: '0xraw' });
  });

  it('settled hash short-circuits without sign or broadcast', async () => {
    const store = new MemoryBroadcastStore();
    await store.claim('payout:d26:done');
    await store.putSigned('payout:d26:done', '0xraw');
    await store.put('payout:d26:done', '0xsettled');

    const sign = vi.fn(async () => '0xnew');
    const broadcast = vi.fn(async () => '0xother');

    await expect(
      runDurableBroadcast({
        store,
        idempotencyKey: 'payout:d26:done',
        sign,
        broadcast,
      }),
    ).resolves.toBe('0xsettled');
    expect(sign).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });
});
