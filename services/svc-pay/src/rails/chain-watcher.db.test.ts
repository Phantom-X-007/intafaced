/**
 * Dedicated test database — crash replay against real Postgres.
 * createTestDatabase owns a *_test name so this never TRUNCATEs the fleet.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CRYPTO_NATIVE_WATCHER_ID, CryptoChainWatcher, PostgresChainWatcherCursorStore, type ChainWatcherChain } from './chain-watcher.js';
import type { FinalizedInbound } from './evm-chain.js';

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('PostgresChainWatcherCursorStore (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'pay', url: URL, migrations });
  const sql = db.sql;

  beforeEach(async () => {
    await sql`TRUNCATE pay.chain_watcher_cursors`;
  });

  afterAll(async () => {
    await db.drop();
  }, 30_000);

  const transfer = {
    txHash: '0xdbdead' as `0x${string}`,
    assetId: 'USDT',
    amount: 2_000_000n,
    from: '0x1111111111111111111111111111111111111111',
    confirmations: 6,
  };
  const address = '0x4444444444444444444444444444444444444444';
  const item: FinalizedInbound = { address, transfer, blockNumber: 99n, logIndex: 1 };

  describe('PostgresChainWatcherCursorStore — crash replay does not double-credit', () => {
    it('save/load round-trips last-seen (block, hash, log index)', async () => {
      const store = new PostgresChainWatcherCursorStore(sql);
      expect(await store.load(CRYPTO_NATIVE_WATCHER_ID)).toBeNull();
      await store.save(CRYPTO_NATIVE_WATCHER_ID, { blockNumber: '99', txHash: '0xdbdead', logIndex: 1 });
      expect(await store.load(CRYPTO_NATIVE_WATCHER_ID)).toEqual({
        blockNumber: '99',
        txHash: '0xdbdead',
        logIndex: 1,
      });
    });

    it('a second watcher process sharing the table does not POST twice', async () => {
      const store = new PostgresChainWatcherCursorStore(sql);
      const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }));
      const makeChain = (): ChainWatcherChain & { marked: string[] } => {
        const marked: string[] = [];
        return {
          marked,
          refresh: async () => undefined,
          drainFinalized: () => (marked.length ? [] : [item]),
          markFinalizedEmitted: (addr) => {
            marked.push(addr.toLowerCase());
          },
        };
      };

      const first = makeChain();
      await new CryptoChainWatcher({
        chain: first,
        secret: 'x'.repeat(32),
        webhookUrl: 'http://127.0.0.1:9/webhooks/crypto-native',
        cursorStore: store,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }).tick();
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      const replay = makeChain();
      await new CryptoChainWatcher({
        chain: replay,
        secret: 'x'.repeat(32),
        webhookUrl: 'http://127.0.0.1:9/webhooks/crypto-native',
        cursorStore: store,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }).tick();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(replay.marked).toContain(address.toLowerCase());
    });

    it('will not rewind a later cursor', async () => {
      const store = new PostgresChainWatcherCursorStore(sql);
      await store.save(CRYPTO_NATIVE_WATCHER_ID, { blockNumber: '50', txHash: '0xaaa', logIndex: 0 });
      await store.save(CRYPTO_NATIVE_WATCHER_ID, { blockNumber: '40', txHash: '0xbbb', logIndex: 9 });
      expect(await store.load(CRYPTO_NATIVE_WATCHER_ID)).toEqual({
        blockNumber: '50',
        txHash: '0xaaa',
        logIndex: 0,
      });
    });
  });
}
