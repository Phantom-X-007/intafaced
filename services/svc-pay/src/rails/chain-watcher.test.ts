import { describe, expect, it, vi } from 'vitest';
import { CryptoChainWatcher } from './chain-watcher.js';
import type { FinalizedInbound } from './evm-chain.js';

/**
 * M226-03: failed webhook must not permanently drop finalization.
 * markFinalizedEmitted runs only after 2xx/202.
 */
describe('CryptoChainWatcher — delivery mark-after-success', () => {
  const secret = 'x'.repeat(32);
  const transfer = {
    txHash: '0xdead' as `0x${string}`,
    assetId: 'USDT',
    amount: 1_000_000n,
    from: '0x1111111111111111111111111111111111111111',
    confirmations: 6,
  };
  const address = '0x2222222222222222222222222222222222222222';
  const item: FinalizedInbound = { address, transfer };

  it('does not mark when webhook rejects; marks after success on retry', async () => {
    const marked: string[] = [];
    let drainCalls = 0;
    const chain = {
      refresh: vi.fn(async () => undefined),
      drainFinalized: vi.fn((): FinalizedInbound[] => {
        drainCalls += 1;
        // Until marked, keep returning the same finalization (peek semantics).
        if (marked.includes(address.toLowerCase())) return [];
        return [item];
      }),
      markFinalizedEmitted: vi.fn((addr: string) => {
        marked.push(addr.toLowerCase());
      }),
    };

    let attempt = 0;
    const fetchImpl = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) return new Response('nope', { status: 500 });
      return new Response('ok', { status: 200 });
    });

    const watcher = new CryptoChainWatcher({
      // @ts-expect-error test double — only watcher-used surface
      chain,
      secret,
      webhookUrl: 'http://127.0.0.1:9/webhooks/crypto-native',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(await watcher.tick()).toBe(1);
    expect(chain.markFinalizedEmitted).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    expect(await watcher.tick()).toBe(1);
    expect(chain.markFinalizedEmitted).toHaveBeenCalledWith(address);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    expect(await watcher.tick()).toBe(0);
    expect(drainCalls).toBeGreaterThanOrEqual(3);
  });

  it('treats 202 as success for mark', async () => {
    const marked: string[] = [];
    const chain = {
      refresh: vi.fn(async () => undefined),
      drainFinalized: vi.fn((): FinalizedInbound[] => (marked.length ? [] : [item])),
      markFinalizedEmitted: vi.fn((addr: string) => {
        marked.push(addr.toLowerCase());
      }),
    };
    const watcher = new CryptoChainWatcher({
      // @ts-expect-error test double
      chain,
      secret,
      webhookUrl: 'http://127.0.0.1:9/webhooks/crypto-native',
      fetchImpl: (async () => new Response('', { status: 202 })) as unknown as typeof fetch,
    });
    await watcher.tick();
    expect(chain.markFinalizedEmitted).toHaveBeenCalledOnce();
  });
});
