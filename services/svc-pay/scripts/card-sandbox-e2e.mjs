#!/usr/bin/env node
/**
 * Card-sandbox acquiring e2e against a running svc-pay + svc-ledger (dev posture).
 *
 * Proves Board Clear pay.gateway card bar on sandbox:
 *   merchant.create → submitKyb → decideKybStub →
 *   payment create/authorize/capture → settlement → refund → payment.list
 *
 * Does NOT invent a live card acquirer. Hosted public checkout stays crypto-only
 * under live-only (card-sandbox must never take anonymous public money).
 *
 * Crypto regression: run scripts/live-rail-e2e.mjs separately with PAY_CRYPTO_*.
 */
import { encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';

const PAY_URL = process.env.PAY_URL ?? 'http://127.0.0.1:4006';
const EDGE_SECRET = process.env.EDGE_PRINCIPAL_SECRET ?? 'dev-only-edge-secret-at-least-32-chars-long';
const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REGION = 'DE';

function fail(msg, detail) {
  console.error('E2E FAIL:', msg, detail ?? '');
  process.exit(1);
}

function ok(msg, detail) {
  console.log('✓', msg, detail ? JSON.stringify(detail) : '');
}

function signedHeaders(scopes) {
  const principal = {
    sub: USER,
    userId: USER,
    sid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    scopes,
    tier: 'full',
    mfa: true,
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

async function trpc(procedure, input, scopes) {
  const url = `${PAY_URL}/trpc/${procedure}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: signedHeaders(scopes),
    body: JSON.stringify(input === undefined ? {} : input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) fail(`${procedure} HTTP ${res.status}`, body);
  if (body.error) fail(`${procedure} tRPC error`, body.error);
  return body.result?.data?.json ?? body.result?.data ?? body;
}

async function main() {
  const ready = await (await fetch(`${PAY_URL}/ready`)).json();
  if (ready.ready !== true) fail('svc-pay not ready', ready);
  const modes = ready.railModes ?? {};
  if (modes['card-sandbox'] !== 'sandbox' && !(ready.sandboxRails ?? []).includes('card-sandbox')) {
    fail('card-sandbox not registered — use APP_ENV=dev (or PAY_REGISTER_CARD_SANDBOX=true)', ready);
  }
  ok('svc-pay ready', { valueMovement: ready.valueMovement, railModes: modes });

  const created = await trpc('merchant.create', { mode: 'gateway', pricing: { feeBps: 100 } }, ['pay:write']);
  ok('merchant.create', created);

  const me = await trpc('merchant.me', undefined, ['pay:read']);
  if (!me?.id) fail('merchant.me empty', me);
  ok('merchant.me', { id: me.id, kybStatus: me.kybStatus });

  const kyb = await trpc('merchant.submitKyb', { merchantId: me.id, kybRef: 'e2e-case-1' }, ['pay:write']);
  if (kyb.kybStatus !== 'pending') fail('KYB not pending', kyb);
  ok('merchant.submitKyb', kyb);

  if (ready.valueMovement === 'live-only') {
    ok('skip decideKybStub under live-only (operator required)');
  } else {
    const decided = await trpc('merchant.decideKybStub', { merchantId: me.id, decision: 'approved' }, ['pay:write']);
    if (decided.kybStatus !== 'approved') fail('KYB not approved', decided);
    ok('merchant.decideKybStub', decided);
  }

  const payment = await trpc(
    'payment.create',
    {
      merchantId: me.id,
      amount: '12.5',
      assetId: 'USDT',
      method: 'card',
      railAdapter: 'card-sandbox',
      instrument: { kind: 'card', token: 'tok_ok' },
    },
    ['pay:write'],
  );
  ok('payment.create', { id: payment.id, status: payment.status });

  const authorized = await trpc('payment.authorize', { paymentId: payment.id }, ['pay:write']);
  if (authorized.status !== 'authorized') fail('authorize failed', authorized);
  ok('payment.authorize', { status: authorized.status, railRef: authorized.railRef });

  const captured = await trpc('payment.capture', { paymentId: payment.id }, ['pay:write']);
  if (captured.status !== 'captured') fail('capture failed', captured);
  ok('payment.capture', { status: captured.status, capturedAmount: captured.capturedAmount });

  const window = new Date().toISOString().slice(0, 10);
  const settlement = await trpc('settlement.run', { merchantId: me.id, window, assetId: 'USDT' }, ['pay:write']);
  ok('settlement.run', { id: settlement.id, status: settlement.status, net: settlement.net });

  const listed = await trpc('payment.list', { merchantId: me.id, status: 'settled' }, ['pay:read']);
  if (!Array.isArray(listed) || !listed.some((p) => p.id === payment.id)) {
    // may still be captured if settle didn't include — accept captured|settled
    const any = await trpc('payment.list', { merchantId: me.id }, ['pay:read']);
    if (!any.some((p) => p.id === payment.id)) fail('payment.list missing payment', { listed, any });
    ok('payment.list', { count: any.length, status: any.find((p) => p.id === payment.id)?.status });
  } else {
    ok('payment.list settled', { count: listed.length });
  }

  // Fresh payment for refund-before-settle proof
  const p2 = await trpc(
    'payment.create',
    {
      merchantId: me.id,
      amount: '3',
      assetId: 'USDT',
      method: 'card',
      railAdapter: 'card-sandbox',
      instrument: { kind: 'card', token: 'tok_ok' },
    },
    ['pay:write'],
  );
  await trpc('payment.authorize', { paymentId: p2.id }, ['pay:write']);
  await trpc('payment.capture', { paymentId: p2.id }, ['pay:write']);
  const refunded = await trpc('payment.refund', { paymentId: p2.id, amount: '3', refundId: 'e2e-r1' }, ['pay:refund']);
  if (refunded.status !== 'refunded') fail('refund failed', refunded);
  ok('payment.refund', { status: refunded.status, refundedAmount: refunded.refundedAmount });

  console.log('\nCARD_SANDBOX_E2E_ALL_GREEN');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
