import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import { ProtocolChain } from './client.js';
import { ChainUnavailableError } from './availability.js';
import { createProtocolRouter } from '../router.js';
import { AccountRegistry, MemoryAccountStore } from '../accounts/registry.js';
import { SessionRelay } from '../session/relay.js';
import { createEdgeContext } from '@intafaced/contracts';
import { devChainReachable, devRpcUrl, DEV_CHAIN_ID } from '../../scripts/dev-chain.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A LOCAL DEV CHAIN MUST NOT BECOME SOMETHING PRODUCTION QUIETLY NEEDS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The `evm` service in docker-compose.yml is dev-only, and the point of this
 * file is that its absence changes nothing about how svc-protocol behaves.
 * Stop the container, unset the env, deploy to an environment that has no
 * chain — every dependent path must still refuse with the typed code it shipped
 * with, and none of them may start answering because "there is usually a chain
 * now".
 *
 * ── Why this exists alongside router.mount.test.ts ─────────────────────────
 *
 * That suite proves the same contract with a hand-built chain stub. It is a
 * good test and it has a blind spot it names itself: a stub throws the error
 * the test author expected. This one uses the REAL `ProtocolChain`, with real
 * viem, pointed at a real TCP port with nothing listening on it — so the error
 * being classified is one the network produced, not one a test wrote down.
 *
 * That distinction is exactly where `classifyChainError` could rot: viem
 * re-wraps errors as it bubbles them through the transport, so the shape a stub
 * asserts can drift from the shape a socket actually produces on a viem
 * upgrade, and nothing would notice.
 *
 * No chain is needed to run this. That is the whole idea.
 */

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

const DEAD_RPC = `http://127.0.0.1:${await closedPort()}`;

const FACTORY: Address = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const IMPLEMENTATION: Address = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const ENTRYPOINT: Address = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const OWNER: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const ZERO: Address = '0x0000000000000000000000000000000000000000';

const anonymous = () =>
  createEdgeContext({ secret: 'a-refusal-suite-edge-secret-long-enough', serviceName: 'svc-protocol' })({
    headers: { 'x-intafaced-region': 'DE' },
    id: 'req-dead',
  });

function routerFor(chain: ProtocolChain, factory: Address, implementation: Address) {
  return createProtocolRouter({
    chain,
    registry: new AccountRegistry(new MemoryAccountStore(), { chainId: DEV_CHAIN_ID, factory, implementation }),
    relay: new SessionRelay(chain),
    relayEnabled: () => true,
    ammFactoryAddress: () => ZERO,
  }).createCaller(anonymous());
}

const deadChain = new ProtocolChain({
  chainId: DEV_CHAIN_ID,
  rpcUrl: DEAD_RPC,
  entryPoint: ENTRYPOINT,
  // Real, correct addresses — from the dev deployment. The point is that
  // CONFIGURED addresses buy nothing when nobody can reach the chain they are on.
  factory: FACTORY,
  implementation: IMPLEMENTATION,
});

describe('a real ProtocolChain pointed at a closed socket', () => {
  it('classifies the transport failure as chain_unreachable, from a real refused connection', async () => {
    const error = await deadChain.isDeployed(OWNER).then(
      () => null,
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(ChainUnavailableError);
    expect((error as ChainUnavailableError).code).toBe('protocol.chain_unreachable');
    expect((error as ChainUnavailableError).message).toContain(DEAD_RPC);
  });

  it('reports the outage as data on status(), and claims nothing about deployment', async () => {
    await expect(deadChain.status()).resolves.toMatchObject({
      reachable: false,
      observedChainId: null,
      blockNumber: null,
      suiteConfigured: true,
      // Configured is not deployed. Nobody looked, so nothing is claimed.
      suiteDeployed: false,
      refusalCode: 'protocol.chain_unreachable',
    });
  });
});

describe('the router with no chain behind it — unchanged behaviour', () => {
  const caller = () => routerFor(deadChain, FACTORY, IMPLEMENTATION);

  it('refuses predictAddress with 503 and the code intact, never an address', async () => {
    await expect(caller().predictAddress({ owner: OWNER })).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      message: expect.stringContaining('protocol.chain_unreachable'),
    });
  });

  it('refuses sessionStatus rather than answering exists:false', async () => {
    await expect(caller().sessionStatus({ account: FACTORY, sessionKey: OWNER })).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('refuses claimAccount, because it cannot read whether the account is deployed', async () => {
    // Unauthenticated here, so the scope guard refuses first — which is itself
    // the right order. The chain read is unreachable either way.
    await expect(caller().claimAccount({ owner: OWNER, address: FACTORY, signature: `0x${'11'.repeat(65)}` })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('reports usable:false on chainStatus so a surface renders the outage', async () => {
    await expect(caller().chainStatus()).resolves.toMatchObject({
      reachable: false,
      suiteDeployed: false,
      usable: false,
      refusalCode: 'protocol.chain_unreachable',
    });
  });

  /**
   * buildDeployment builds bytes and reads nothing, so it still answers with a
   * chain down. That is correct and worth pinning: the calldata is valid
   * whenever the addresses are, and a user can hold it until a chain exists.
   */
  it('still builds deployment calldata, because building reads nothing', async () => {
    await expect(caller().buildDeployment({ owner: OWNER })).resolves.toMatchObject({ to: FACTORY, value: '0' });
  });

  it('still refuses everything when the addresses are the zero defaults', async () => {
    const unconfigured = new ProtocolChain({
      chainId: DEV_CHAIN_ID,
      rpcUrl: DEAD_RPC,
      entryPoint: ENTRYPOINT,
      factory: ZERO,
      implementation: ZERO,
    });
    const caller = routerFor(unconfigured, ZERO, ZERO);

    await expect(caller.predictAddress({ owner: OWNER })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(caller.buildDeployment({ owner: OWNER })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(caller.chainStatus()).resolves.toMatchObject({ suiteConfigured: false, suiteDeployed: false, usable: false });
    await expect(caller.health()).resolves.toMatchObject({ ok: true, factoryConfigured: false });
  });
});

/**
 * The dev chain answering for the wrong chain id must be refused just as hard.
 * A CREATE2 address is only meaningful on the chain its factory sits on, so a
 * mismatched RPC makes every prediction an address the user can fund and never
 * reach. Needs a live node to be a real test, so it skips without one.
 */
describe.skipIf(!(await devChainReachable()))('an RPC answering for a different chain', () => {
  it('refuses with chain_id_mismatch and names both ids', async () => {
    const wrongChain = new ProtocolChain({
      chainId: 1,
      rpcUrl: devRpcUrl(),
      entryPoint: ENTRYPOINT,
      factory: FACTORY,
      implementation: IMPLEMENTATION,
    });
    const status = await wrongChain.status();
    expect(status).toMatchObject({ reachable: false, observedChainId: null, refusalCode: 'protocol.chain_id_mismatch' });
    expect(status.reason).toContain(String(DEV_CHAIN_ID));
    expect(status.reason).toContain('never reach');
  });
});
