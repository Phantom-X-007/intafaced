import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import { EvmChainSource } from './source.js';
import { ChainUnavailableError } from './availability.js';

/**
 * CONSTRUCTION AND DEAD-ENDPOINT REFUSALS — always on, no anvil.
 *
 * The live suite (`source.live.test.ts`) already asserts these shapes, but
 * only when a chain answers at boot. Without that gate, a dark or dead chain
 * would leave the promise unproven on every clean clone and every CI run that
 * does not bring anvil up first.
 *
 * These tests need no JSON-RPC answer:
 *   · empty URL / zero venue are pure constructor checks
 *   · a dead TCP port is enough to force `head()` through the real transport
 *     and prove the refusal is a throw, not `null`
 */

const VENUE: Address = '0x1111111111111111111111111111111111111111';
const ZERO: Address = '0x0000000000000000000000000000000000000000';

/** A port nothing is listening on — bound to learn the number, then released. */
async function closedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'string' || address === null) {
        server.close();
        reject(new Error('no port'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

describe('EvmChainSource · refuse a dark chain at construct (no RPC)', () => {
  it('refuses an empty RPC URL with indexer.chain_not_configured', () => {
    expect(() => new EvmChainSource({ chainId: 31337, rpcUrl: '', venue: VENUE })).toThrow(ChainUnavailableError);
    try {
      new EvmChainSource({ chainId: 31337, rpcUrl: '', venue: VENUE });
    } catch (err) {
      expect(err).toMatchObject({ code: 'indexer.chain_not_configured' });
      expect((err as Error).message).toMatch(/RPC URL|NullChainSource/i);
    }
  });

  /**
   * `eth_getLogs` against 0x0 succeeds and returns [] forever. Without this
   * check the projection would stay empty and every read would report an empty
   * book with total confidence — the quietest failure available to a log decoder.
   */
  it('refuses a zero venue address with indexer.chain_not_configured, before any RPC', () => {
    expect(() => new EvmChainSource({ chainId: 31337, rpcUrl: 'http://127.0.0.1:8545', venue: ZERO })).toThrow(ChainUnavailableError);
    try {
      new EvmChainSource({ chainId: 31337, rpcUrl: 'http://127.0.0.1:8545', venue: ZERO });
    } catch (err) {
      expect(err).toMatchObject({ code: 'indexer.chain_not_configured' });
      expect((err as Error).message).toMatch(/zero address/i);
    }
  });
});

describe('EvmChainSource · dead endpoint throws, never null', () => {
  /**
   * The refusal that must never be `null`. A dead endpoint returning "no chain"
   * would be indistinguishable from `NullChainSource`: the loop would idle, the
   * cursor would freeze, and `book` would keep serving its last projection as
   * current with nothing anywhere saying otherwise.
   *
   * Uses a real TCP port with nothing listening — so the error classified is
   * one the network produced, not one a test wrote down.
   */
  it('throws indexer.chain_unreachable from head() when nothing answers', async () => {
    const port = await closedPort();
    const dead = new EvmChainSource({
      chainId: 31337,
      rpcUrl: `http://127.0.0.1:${port}`,
      venue: VENUE,
      requestTimeoutMs: 2_000,
    });

    await expect(dead.head()).rejects.toMatchObject({ code: 'indexer.chain_unreachable' });
    // Explicit: the promise rejects — it does not resolve to null.
    let resolved: unknown = 'did-not-settle';
    try {
      resolved = await dead.head();
    } catch (err) {
      expect(err).toBeInstanceOf(ChainUnavailableError);
      expect((err as ChainUnavailableError).code).toBe('indexer.chain_unreachable');
      resolved = 'threw';
    }
    expect(resolved).toBe('threw');
  }, 30_000);
});
