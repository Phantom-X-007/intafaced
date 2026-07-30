import { beforeAll, describe, expect, it } from 'vitest';
import type { Address, Abi } from 'viem';
import { EvmChainSource } from './source.js';
import { ChainUnavailableError } from './availability.js';
import {
  DEV_CHAIN_ID,
  deployDevVenue,
  devChainClients,
  devChainReachable,
  devChainRequired,
  devRpcUrl,
  marketWord,
  scaled,
  type DevChainClients,
} from '../../../scripts/dev-venue.js';

/**
 * THE ADAPTER, AGAINST A CHAIN THAT REALLY EXISTS.
 *
 * Everything this service knew about EVM behaviour until now came from
 * `MemoryChainSource` — a deterministic fake whose block hashes this repository
 * computes itself. That proves the projection matches the design and proves
 * nothing at all about whether the design survives an EVM: it never linked a
 * real `parentHash`, never decoded a log a chain produced, and never asked a
 * node a question it could answer wrongly.
 *
 * This file runs against the shared dev chain (`evm`, port 8545) and is
 * deliberately NON-DESTRUCTIVE — it deploys and it reads, and it never rewinds
 * the node. The suite that reorgs runs against its own chain; see
 * `reorg.live.test.ts` and the `evm-reorg` service in docker-compose.yml.
 *
 * Skips without a chain, hard-fails on CI where `REQUIRE_EVM_CHAIN=1`. A
 * silently skipped proof is how "we tested the adapter" quietly stops being true.
 */

const rpcUrl = devRpcUrl();
const reachable = await devChainReachable(rpcUrl);

if (!reachable && devChainRequired()) {
  throw new Error(`REQUIRE_EVM_CHAIN=1 but no EVM RPC answered at ${rpcUrl}. Start it with: docker compose up -d evm`);
}

const MARKET = 'ETH-USD';

if (!reachable) {
  describe.skip(`svc-indexer · EVM adapter (no chain at ${rpcUrl} — docker compose up -d evm)`, () => {
    it('skipped', () => undefined);
  });
} else {
  // Account index 6: svc-protocol reserves 0 for its deploy script and uses low
  // indices in its own suites. Two workers on one deployer race the same nonce,
  // which surfaces as `nonce too low` in whichever one loses — intermittently, on
  // a chain that is behaving perfectly.
  const clients: DevChainClients = devChainClients(rpcUrl, DEV_CHAIN_ID, 6);
  let venue: Address;
  let abi: Abi;
  let deploymentBlock: number;
  let source: EvmChainSource;

  beforeAll(async () => {
    const deployed = await deployDevVenue(clients);
    venue = deployed.address;
    abi = deployed.abi;
    deploymentBlock = deployed.deploymentBlock;
    source = new EvmChainSource({ chainId: DEV_CHAIN_ID, rpcUrl, venue });
  }, 60_000);

  /** One transaction, one block, three logs. Returns the block it landed in. */
  async function publishAll(overrides: {
    price: string;
    quantity: string;
    fillQuantity: string;
    size: string;
    side?: number;
    takerSide?: number;
  }): Promise<number> {
    const hash = await clients.walletClient.writeContract({
      address: venue,
      abi,
      functionName: 'publishAll',
      args: [
        {
          market: marketWord(MARKET),
          side: overrides.side ?? 0,
          levelPrice: scaled(overrides.price),
          levelQuantity: scaled(overrides.quantity),
          maker: clients.deployer,
          taker: clients.deployer,
          fillPrice: scaled(overrides.price),
          fillQuantity: scaled(overrides.fillQuantity),
          takerSide: overrides.takerSide ?? 0,
          account: clients.deployer,
          size: scaled(overrides.size),
          entryPrice: scaled(overrides.price),
        },
      ],
      account: clients.walletClient.account!,
      chain: clients.walletClient.chain,
    });
    const receipt = await clients.publicClient.waitForTransactionReceipt({ hash });
    return Number(receipt.blockNumber);
  }

  describe('svc-indexer · EVM adapter — real blocks', () => {
    it('reads a head that is a real tip, not a guess', async () => {
      const head = await source.head();
      expect(head).not.toBeNull();
      expect(head!.height).toBeGreaterThanOrEqual(deploymentBlock);
      expect(head!.hash).toMatch(/^0x[0-9a-f]{64}$/);
    });

    /**
     * The property the whole reorg design rests on and that `MemoryChainSource`
     * could only assert about hashes it invented: consecutive blocks LINK. If
     * `parentHash` did not really chain, the fork detector in `indexer.ts` would
     * be comparing noise.
     */
    it('produces blocks whose parentHash really is the previous block’s hash', async () => {
      const head = await source.head();
      const tip = await source.blockAt(head!.height);
      const parent = await source.blockAt(head!.height - 1);
      expect(tip!.parentHash).toBe(parent!.hash);
      expect(tip!.height).toBe(parent!.height + 1);
      expect(tip!.timestamp).toBeGreaterThan(0);
    });

    it('returns null above the tip — caught up is not an error', async () => {
      const head = await source.head();
      expect(await source.blockAt(head!.height + 5_000)).toBeNull();
    });

    it('normalises hashes to lowercase, so a hash compared two ways cannot differ', async () => {
      const head = await source.head();
      const block = await source.blockAt(head!.height);
      expect(block!.hash).toBe(block!.hash.toLowerCase());
      expect(block!.parentHash).toBe(block!.parentHash.toLowerCase());
    });
  });

  describe('svc-indexer · EVM adapter — real logs', () => {
    it('decodes a real block’s worth of logs into the three event kinds', async () => {
      const height = await publishAll({ price: '3000.5', quantity: '2.25', fillQuantity: '0.5', size: '0.5' });
      const block = await source.blockAt(height);

      expect(block!.events.map((e) => e.kind)).toEqual(['book_level', 'fill', 'position']);
      expect(block!.events[0]).toMatchObject({ market: MARKET, side: 'bid', price: '3000.5', quantity: '2.25' });
      expect(block!.events[1]).toMatchObject({ market: MARKET, price: '3000.5', quantity: '0.5', takerSide: 'buy' });
      expect(block!.events[2]).toMatchObject({ market: MARKET, size: '0.5', entryPrice: '3000.5' });
      // Log indices are the chain's own, and they are what a fill's primary key
      // is built from.
      expect(block!.events.map((e) => e.logIndex)).toEqual([0, 1, 2]);
    });

    /**
     * The eighteenth decimal place, through a real EVM word, a real log, a real
     * ABI decode and back to a string. This is the number a float loses and
     * nothing downstream would ever notice.
     */
    it('carries eighteen decimal places through the chain intact', async () => {
      const height = await publishAll({
        price: '0.999999999999999999',
        quantity: '0.000000000000000001',
        fillQuantity: '0.000000000000000001',
        size: '-0.999999999999999999',
        side: 1,
        takerSide: 1,
      });
      const block = await source.blockAt(height);
      expect(block!.events[0]).toMatchObject({ side: 'ask', price: '0.999999999999999999', quantity: '0.000000000000000001' });
      expect(block!.events[2]).toMatchObject({ size: '-0.999999999999999999' });
    });

    /**
     * THE MOST IMPORTANT LINE IN THE ADAPTER, PINNED.
     *
     * Logs must be fetched by `blockHash`, never by `fromBlock`/`toBlock`.
     * Reading a header at height N and then logs "at height N" asks about height
     * N twice, and a reorg between the two calls has the node answer both
     * correctly about two different blocks — stapling branch B's logs onto branch
     * A's header. The result is a block that never existed, carrying a hash that
     * says it did, recorded canonical, with nothing left to detect it by.
     *
     * That race cannot be staged deterministically, so this asserts the SHAPE of
     * the call instead: it proves the adapter asks the reorg-safe question. It
     * does not prove the node is honest about it, which is not something a test
     * can establish. Without this, swapping the two is a one-line change nothing
     * in the suite notices.
     */
    it('fetches logs by block hash, never by block number', async () => {
      const requests: Array<{ method: string; params?: unknown }> = [];
      const client = source.client as unknown as { request: (...args: never[]) => Promise<unknown> };
      const original = client.request.bind(client);
      client.request = (async (args: { method: string; params?: unknown }, ...rest: never[]) => {
        requests.push(args);
        return original(args as never, ...rest);
      }) as never;

      try {
        const head = await source.head();
        await source.blockAt(head!.height);
      } finally {
        client.request = original as never;
      }

      const getLogs = requests.filter((r) => r.method === 'eth_getLogs');
      expect(getLogs).toHaveLength(1);
      const filter = (getLogs[0]!.params as [Record<string, unknown>])[0];
      expect(filter).toHaveProperty('blockHash');
      expect(filter).not.toHaveProperty('fromBlock');
      expect(filter).not.toHaveProperty('toBlock');
      // …and it is scoped to the venue, which is the other half of "these logs
      // are ours".
      expect(String(filter.address).toLowerCase()).toBe(venue.toLowerCase());
    });

    /**
     * A venue emits events this adapter never claimed. Stopping the projection
     * on one would be a service outage caused by a log that was none of its
     * business.
     */
    it('ignores a log it does not claim, and still projects the rest of the block', async () => {
      const hash = await clients.walletClient.writeContract({
        address: venue,
        abi,
        functionName: 'emitUnrelated',
        args: [7n],
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      });
      const receipt = await clients.publicClient.waitForTransactionReceipt({ hash });
      const block = await source.blockAt(Number(receipt.blockNumber));
      expect(block).not.toBeNull();
      expect(block!.events).toEqual([]);
    });

    /**
     * Logs are filtered by ADDRESS, so a second venue's trades cannot appear in
     * this one's book. Proven by deploying a second one and emitting from it.
     */
    it('reads only the configured venue’s logs', async () => {
      const other = await deployDevVenue(clients);
      const hash = await clients.walletClient.writeContract({
        address: other.address,
        abi: other.abi,
        functionName: 'publishLevel',
        args: [marketWord('IMPOSTOR'), 0, scaled('1'), scaled('1')],
        account: clients.walletClient.account!,
        chain: clients.walletClient.chain,
      });
      const receipt = await clients.publicClient.waitForTransactionReceipt({ hash });

      const block = await source.blockAt(Number(receipt.blockNumber));
      expect(block!.events).toEqual([]);

      // The control: the same block, read through a source pointed at the OTHER
      // venue, does contain it. Without this the assertion above would pass if
      // the adapter simply decoded nothing.
      const otherSource = new EvmChainSource({ chainId: DEV_CHAIN_ID, rpcUrl, venue: other.address });
      const seen = await otherSource.blockAt(Number(receipt.blockNumber));
      expect(seen!.events).toHaveLength(1);
      expect(seen!.events[0]).toMatchObject({ market: 'IMPOSTOR' });
    }, 60_000);
  });

  describe('svc-indexer · EVM adapter — refusals, never an empty answer', () => {
    /**
     * The most dangerous configuration mistake available to this service.
     * `eth_getLogs` against an address with no code SUCCEEDS and returns `[]` —
     * so without this check the projection would stay empty and every read would
     * report an empty book, confidently, forever.
     */
    it('refuses when the venue address holds no code', async () => {
      const absent = new EvmChainSource({
        chainId: DEV_CHAIN_ID,
        rpcUrl,
        venue: '0x000000000000000000000000000000000000dEaD',
      });
      await expect(absent.head()).rejects.toMatchObject({ code: 'indexer.venue_not_deployed' });

      const probe = await absent.probe();
      expect(probe).toMatchObject({ reachable: true, venueDeployed: false });

      // …and the control: eth_getLogs against that address really does succeed
      // with an empty array, which is the whole reason the check has to exist.
      const logs = await absent.client.getLogs({ address: '0x000000000000000000000000000000000000dEaD' });
      expect(logs).toEqual([]);
    });

    it('refuses a venue address of zero at construction, before any RPC call', () => {
      expect(() => new EvmChainSource({ chainId: DEV_CHAIN_ID, rpcUrl, venue: '0x0000000000000000000000000000000000000000' })).toThrow(
        ChainUnavailableError,
      );
    });

    /**
     * `blocks.chain_id` is part of every primary key in the read model.
     * Projecting one chain's blocks into rows stamped with another chain's id
     * produces a book that claims to describe a chain it has never read, and no
     * later query can tell.
     */
    it('refuses an RPC that is answering for a different chain', async () => {
      const wrongChain = new EvmChainSource({ chainId: DEV_CHAIN_ID + 1, rpcUrl, venue });
      await expect(wrongChain.head()).rejects.toMatchObject({ code: 'indexer.chain_id_mismatch' });

      const probe = await wrongChain.probe();
      expect(probe).toMatchObject({ reachable: false, observedChainId: null, refusalCode: 'indexer.chain_id_mismatch' });
      expect(probe.reason).toContain(String(DEV_CHAIN_ID));
    });

    /**
     * The refusal that must never be `null`. A dead endpoint returning "no
     * chain" would be indistinguishable from `NullChainSource`: the loop would
     * idle, the cursor would freeze, and `book` would keep serving its last
     * projection as current with nothing anywhere saying otherwise.
     */
    it('throws rather than returning null when the endpoint is dead', async () => {
      // Port 1 — reserved, and nothing has ever listened on it.
      const dead = new EvmChainSource({ chainId: DEV_CHAIN_ID, rpcUrl: 'http://127.0.0.1:1', venue, requestTimeoutMs: 2_000 });
      await expect(dead.head()).rejects.toMatchObject({ code: 'indexer.chain_unreachable' });
      await expect(dead.blockAt(1)).rejects.toMatchObject({ code: 'indexer.chain_unreachable' });

      const probe = await dead.probe();
      expect(probe).toMatchObject({ reachable: false, chainHeight: null, venueDeployed: false, refusalCode: 'indexer.chain_unreachable' });
    }, 30_000);
  });

  describe('svc-indexer · EVM adapter — the staleness probe', () => {
    it('reports the chain’s own tip, verified rather than configured', async () => {
      const probe = await source.probe();
      expect(probe).toMatchObject({ kind: 'evm', reachable: true, observedChainId: DEV_CHAIN_ID, venueDeployed: true });
      expect(probe.chainHeight).toBeGreaterThanOrEqual(deploymentBlock);
      expect(probe.refusalCode).toBeNull();

      // It is LIVE, not a cached copy of what the last sync saw: mine a block and
      // the number moves.
      const before = probe.chainHeight!;
      await publishAll({ price: '1', quantity: '1', fillQuantity: '1', size: '1' });
      expect((await source.probe()).chainHeight!).toBeGreaterThan(before);
    });
  });
}
