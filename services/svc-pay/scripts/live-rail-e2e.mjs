#!/usr/bin/env node
/**
 * Live-rail e2e against a running svc-pay + anvil + svc-ledger.
 *
 * Proves: staging live posture → merchant create → crypto payment → on-chain
 * deposit → authorize/capture → withdrawal payout with real txHash.
 */
import { createPublicClient, createWalletClient, defineChain, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';

const PAY_URL = process.env.PAY_URL ?? 'http://127.0.0.1:4006';
const EDGE_SECRET = process.env.EDGE_PRINCIPAL_SECRET ?? 'dev-only-edge-secret-at-least-32-chars-long';
const RPC = process.env.PAY_CRYPTO_RPC_URL ?? 'http://127.0.0.1:8545';
const CHAIN_ID = Number(process.env.PAY_CRYPTO_CHAIN_ID ?? 31337);
const PAYER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REGION = 'DE';

const chain = defineChain({
  id: CHAIN_ID,
  name: 'pay-e2e',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

function fail(msg, detail) {
  console.error('E2E FAIL:', msg, detail ?? '');
  process.exit(1);
}

function ok(msg, detail) {
  console.log('✓', msg, detail ? JSON.stringify(detail) : '');
}

function signedHeaders(scopes, { mfa = false } = {}) {
  const principal = {
    sub: USER,
    userId: USER,
    sid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    scopes,
    tier: 'full',
    mfa,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  };
  const raw = encodePrincipal(principal);
  return {
    'content-type': 'application/json',
    'x-intafaced-principal': raw,
    'x-intafaced-principal-sig': signPrincipalHeader(raw, EDGE_SECRET, REGION),
    'x-intafaced-region': REGION,
  };
}

async function trpc(procedure, input, scopes, opts) {
  const url = `${PAY_URL}/trpc/${procedure}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: signedHeaders(scopes, opts),
    body: JSON.stringify(input === undefined ? {} : input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) fail(`${procedure} HTTP ${res.status}`, body);
  // tRPC HTTP: { result: { data: ... } } or { error }
  if (body.error) fail(`${procedure} tRPC error`, body.error);
  return body.result?.data?.json ?? body.result?.data ?? body;
}

async function main() {
  const ready = await (await fetch(`${PAY_URL}/ready`)).json();
  if (ready.railModes?.['crypto-native'] !== 'live') fail('rail not live', ready);
  if (ready.valueMovement !== 'live-only') fail('not live-only', ready);
  ok('svc-pay ready live-only', { liveRails: ready.liveRails });

  const merchant = await trpc('merchant.create', { userId: USER, mode: 'gateway', pricing: { feeBps: 50 } }, ['pay:write']);
  ok('merchant.create', merchant);

  const payment = await trpc(
    'payment.create',
    {
      merchantId: merchant.id,
      amount: '0.02',
      assetId: 'ETH',
      method: 'crypto',
      railAdapter: 'crypto-native',
    },
    ['pay:write'],
  );
  ok('payment.create', { id: payment.id, status: payment.status });

  let auth = await trpc('payment.authorize', { paymentId: payment.id }, ['pay:write']);
  ok('payment.authorize (pending expected)', { status: auth.status, railRef: auth.railRef });
  if (!auth.railRef) fail('no acceptance address on authorize', auth);

  const payer = privateKeyToAccount(PAYER_KEY);
  const wallet = createWalletClient({ account: payer, chain, transport: http(RPC) });
  const publicClient = createPublicClient({ chain, transport: http(RPC) });
  const hash = await wallet.sendTransaction({
    account: payer,
    to: auth.railRef,
    value: parseEther('0.02'),
    chain,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  for (let i = 0; i < 3; i++) {
    await publicClient.request({ method: 'evm_mine', params: [] }).catch(() => undefined);
  }
  ok('on-chain deposit mined', { hash, to: auth.railRef });

  // Poll authorize until authorized (refresh scans new blocks)
  for (let i = 0; i < 20; i++) {
    auth = await trpc('payment.authorize', { paymentId: payment.id }, ['pay:write']);
    if (auth.status === 'authorized' || auth.status === 'captured') break;
    await new Promise((r) => setTimeout(r, 500));
  }
  ok('payment.authorize after deposit', { status: auth.status, railRef: auth.railRef });
  if (auth.status !== 'authorized' && auth.status !== 'captured') fail('not authorized after deposit', auth);

  if (auth.status !== 'captured') {
    const captured = await trpc('payment.capture', { paymentId: payment.id }, ['pay:write']);
    ok('payment.capture', { status: captured.status });
    if (captured.status !== 'captured' && captured.status !== 'settled') fail('capture failed', captured);
  }

  // Fund user via operator credit is disabled for crypto — deposit path for
  // retail is rail. For withdrawal proof: credit via ledger isn't available
  // here without admin deposit on a creditable rail. Prove payout on the rail
  // adapter surface via settlement after we have clearing — settlement.run.
  // Window defaults to the UTC calendar day named by `window`. Use today so the
  // just-captured payment is inside the freeze bounds.
  const window = new Date().toISOString().slice(0, 10);
  const settlement = await trpc('settlement.run', { merchantId: merchant.id, window, assetId: 'ETH' }, ['pay:write']);
  ok('settlement.run', settlement);

  const dest = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a').address;
  const payout = await trpc(
    'settlement.payout',
    {
      settlementId: settlement.id,
      railId: 'crypto-native',
      destination: { kind: 'crypto', ref: dest },
    },
    ['pay:payout'],
    { mfa: true },
  );
  ok('settlement.payout', payout);
  const txHash = payout.payoutRef ?? payout.railRef;
  if (!txHash || !String(txHash).startsWith('0x') || String(txHash).length < 66) {
    fail('payout ref is not a real tx hash', payout);
  }
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') fail('payout tx failed on chain', receipt);
  ok('payout tx confirmed on anvil', { txHash, block: receipt.blockNumber.toString() });

  console.log('\nE2E_ALL_GREEN');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
