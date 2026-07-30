import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPublicClient, createWalletClient, defineChain, http, parseEther, type Hex } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { parseAmount } from '@intafaced/ledger-client';
import { MemoryBroadcastStore } from './broadcast-store.js';
import { parseEvmAssets } from './evm-assets.js';
import { EvmLiveChain } from './evm-chain.js';
import { CryptoNativeAdapter } from './crypto-native.js';

/**
 * LIVE proof against a real JSON-RPC (compose `evm` / anvil on :8545).
 *
 * Skips cleanly when the node is absent — CI without anvil must not go red.
 * Set REQUIRE_PAY_EVM=1 to fail instead of skip (compose / paid CI).
 */

const RPC = process.env.PAY_CRYPTO_RPC_URL ?? process.env.PROTOCOL_RPC_URL ?? 'http://127.0.0.1:8545';
const CHAIN_ID = Number(process.env.PAY_CRYPTO_CHAIN_ID ?? process.env.PROTOCOL_CHAIN_ID ?? 31337);

// anvil account #0
const HOT_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
// anvil account #1 — funds deposits from here
const PAYER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex;
const DEPOSIT_MNEMONIC = 'test test test test test test test test test test test junk';
const SECRET = 'live-crypto-webhook-secret-at-least-32-chars!!';

const chainDef = defineChain({
  id: CHAIN_ID,
  name: 'pay-anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

async function rpcReachable(): Promise<boolean> {
  try {
    const client = createPublicClient({ chain: chainDef, transport: http(RPC, { timeout: 2_000 }) });
    const id = await client.getChainId();
    return id === CHAIN_ID;
  } catch {
    return false;
  }
}

const reachable = await rpcReachable();
const describeLive = reachable ? describe : describe.skip;

if (!reachable && process.env.REQUIRE_PAY_EVM === '1') {
  throw new Error(`REQUIRE_PAY_EVM=1 but no chain at ${RPC} (chainId ${CHAIN_ID})`);
}

describeLive('EvmLiveChain against a real node', () => {
  let port: EvmLiveChain;
  let payer: ReturnType<typeof privateKeyToAccount>;

  beforeAll(() => {
    port = new EvmLiveChain({
      rpcUrl: RPC,
      chainId: CHAIN_ID,
      depositMnemonic: DEPOSIT_MNEMONIC,
      hotWalletKey: HOT_KEY,
      assets: parseEvmAssets('ETH:native'),
      broadcasts: new MemoryBroadcastStore(),
      minConfirmations: 1,
    });
    payer = privateKeyToAccount(PAYER_KEY);
  });

  afterAll(() => {
    // nothing to close — http transport is stateless
  });

  it('reports posture live and derives a stable acceptance address', async () => {
    expect(port.posture).toBe('live');
    const a = await port.acceptanceAddress('pay_live_1', 'ETH');
    const b = await port.acceptanceAddress('pay_live_1', 'ETH');
    expect(a).toBe(b);
    expect(a).toMatch(/^0x[0-9a-fA-F]{40}$/);
    // Not the hot wallet — deposits must not land on the payout key.
    expect(a.toLowerCase()).not.toBe(port.hotWalletAddress().toLowerCase());
  });

  it('sees a native deposit and exposes it as inboundTransfer', async () => {
    // Unique payment id → unique HD address. A shared anvil (e2e / prior runs)
    // may already hold funds at a reused index; first-inbound-wins would then
    // report the older txHash instead of this deposit.
    const paymentId = `pay_live_deposit_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const address = await port.acceptanceAddress(paymentId, 'ETH');
    const wallet = createWalletClient({
      account: payer,
      chain: chainDef,
      transport: http(RPC),
    });
    const publicClient = createPublicClient({ chain: chainDef, transport: http(RPC) });

    const hash = await wallet.sendTransaction({
      account: payer,
      to: address as `0x${string}`,
      value: parseEther('0.05'),
      chain: chainDef,
    });
    await publicClient.waitForTransactionReceipt({ hash });

    // Mine a couple of empty blocks so confirmations advance on anvil.
    for (let i = 0; i < 2; i++) {
      await publicClient.request({ method: 'evm_mine' as never, params: [] as never }).catch(() => undefined);
    }

    port.resetScan(0n);
    const transfer = await port.inboundTransfer(address);
    expect(transfer).not.toBeNull();
    expect(transfer!.assetId).toBe('ETH');
    expect(transfer!.amount).toBe(parseAmount('0.05'));
    expect(transfer!.from.toLowerCase()).toBe(payer.address.toLowerCase());
    expect(transfer!.confirmations).toBeGreaterThanOrEqual(1);
    expect(transfer!.txHash).toBe(hash);
  });

  it('makes crypto-native a LIVE rail and pays out idempotently', async () => {
    const adapter = new CryptoNativeAdapter({ chain: port, secret: SECRET, minConfirmations: 1 });
    expect(adapter.mode).toBe('live');

    const dest = mnemonicToAccount(DEPOSIT_MNEMONIC, { addressIndex: 99 }).address;
    const first = await adapter.payout({
      settlementId: 'settle_live_1',
      merchantId: 'm1',
      amount: parseAmount('0.01'),
      assetId: 'ETH',
      window: '2026-07-31',
      destination: { kind: 'crypto', ref: dest },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await adapter.payout({
      settlementId: 'settle_live_1',
      merchantId: 'm1',
      amount: parseAmount('0.01'),
      assetId: 'ETH',
      window: '2026-07-31',
      destination: { kind: 'crypto', ref: dest },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.railRef).toBe(first.railRef);
  });
});
