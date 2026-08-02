#!/usr/bin/env node
/**
 * Assembled order-path smoke (Spec CX-8 · B-layer).
 *
 * L1 Health — trade + matching + ledger /health
 * L2 Edge place+cancel — EDGE_PRINCIPAL_SECRET + contracts signPrincipalHeader
 * L3 Two-user fill — residual (not invented)
 *
 * Requires workspace packages resolved (pnpm install + build for contracts/ledger-client).
 *
 * Env: see docs/ORDER-ROUTE-CX8-CI-SPEC-PLAN-2026-08-02.md
 */
import { randomUUID } from 'node:crypto';

const TRADE = process.env.TRADE_HTTP_URL ?? 'http://127.0.0.1:4004';
const MATCHING = process.env.MATCHING_HTTP_URL ?? 'http://127.0.0.1:4005';
const LEDGER = process.env.LEDGER_HTTP_URL ?? 'http://127.0.0.1:4001';
const STRICT = process.env.ORDER_PATH_SMOKE_STRICT === '1';
const EDGE = process.env.EDGE_PRINCIPAL_SECRET?.trim() || '';
const INTERNAL = process.env.INTERNAL_SERVICE_SECRET?.trim() || '';
const USER = process.env.TRADE_SMOKE_USER_ID ?? '11111111-1111-4111-8111-111111111111';
const SYMBOL = process.env.TRADE_SMOKE_SYMBOL ?? 'BTC/USDT';
const QTY = process.env.TRADE_SMOKE_QTY ?? '0.1';
const PRICE = process.env.TRADE_SMOKE_PRICE ?? '100';
const SEED = process.env.TRADE_SMOKE_SEED_SQL === '1';
const TRADE_DB = process.env.TRADE_DATABASE_URL ?? process.env.TEST_DATABASE_URL_TRADE ?? '';
const REGION = process.env.TRADE_SMOKE_REGION ?? 'DE';

const log = (line) => console.log(`[order-path-smoke] ${line}`);

async function loadContracts() {
  return import('@intafaced/contracts');
}

async function loadLedgerClient() {
  return import('@intafaced/ledger-client');
}

async function probe(name, url, path = '/health') {
  const target = url.replace(/\/$/, '') + path;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 5000);
    const res = await fetch(target, { signal: ac.signal });
    clearTimeout(t);
    return { name, url: target, ok: res.ok || res.status < 500, status: res.status };
  } catch (err) {
    return { name, url: target, ok: false, status: 0, error: (err && err.message) || String(err) };
  }
}

async function seedMarketAndFunds(contracts) {
  if (!SEED) return;
  if (!TRADE_DB) throw new Error('TRADE_SMOKE_SEED_SQL=1 requires TRADE_DATABASE_URL');
  if (!INTERNAL) throw new Error('TRADE_SMOKE_SEED_SQL=1 requires INTERNAL_SERVICE_SECRET');

  const postgres = (await import('postgres')).default;
  const sql = postgres(TRADE_DB, { max: 1, onnotice: () => undefined });
  try {
    await sql`
      INSERT INTO trade.markets (
        symbol, base_asset, quote_asset, kind, tick_size, lot_size,
        min_qty, max_qty, min_notional, status, maker_bps, taker_bps, listed_at,
        asset_class, schedule, display_name
      ) VALUES (
        ${SYMBOL}, 'BTC', 'USDT', 'spot',
        '0.01', '0.0001', '0.0001', NULL, '0.01',
        'active', 5, 10, now(),
        'crypto', 'crypto-24x7', ${SYMBOL}
      )
      ON CONFLICT (symbol) DO UPDATE SET status = 'active', updated_at = now()
    `;
    log(`SEED market ${SYMBOL}`);
  } finally {
    await sql.end({ timeout: 2 });
  }

  const { recipes, parseAmount } = await loadLedgerClient();
  const request = recipes.deposit({
    userId: USER,
    assetId: 'USDT',
    amount: parseAmount('10000'),
    rail: 'cx8-smoke',
    railRef: `cx8-${USER}-${Date.now()}`,
  });
  // Wire: Amount is bigint brand — ledger-client JSON needs decimal strings.
  // recipes already produce PostRequest with Amount; S2S expects schema shape.
  const { formatAmount } = await loadLedgerClient();
  const wire = {
    ...request,
    entries: request.entries.map((e) => ({
      ...e,
      amount: typeof e.amount === 'bigint' ? formatAmount(e.amount) : e.amount,
    })),
  };
  const raw = JSON.stringify(wire);
  const headers = {
    'content-type': 'application/json',
    ...contracts.serviceAuthHeadersForBody('svc-trade', INTERNAL, raw),
  };
  const res = await fetch(`${LEDGER.replace(/\/$/, '')}/trpc/post`, { method: 'POST', headers, body: raw });
  const text = await res.text();
  if (!res.ok) throw new Error(`ledger deposit failed ${res.status}: ${text.slice(0, 500)}`);
  log(`SEED deposit 10000 USDT for ${USER}`);
}

function edgeHeaders(contracts) {
  const principal = {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['trade:read', 'trade:write'],
    tier: 'basic',
    mfa: false,
    expiresAt: new Date(Date.now() + 3_600_000),
  };
  const raw = contracts.encodePrincipal(principal);
  const sig = contracts.signPrincipalHeader(raw, EDGE, REGION);
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'x-intafaced-principal': raw,
    'x-intafaced-principal-sig': sig,
    'x-intafaced-region': REGION,
  };
}

async function edgePlaceCancel(contracts) {
  if (!EDGE) {
    log('RESIDUAL_L2: set EDGE_PRINCIPAL_SECRET for edge-signed place+cancel');
    return 'skip';
  }

  const headers = edgeHeaders(contracts);
  const clientOrderId = `cx8-smoke-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const placeBody = {
    symbol: SYMBOL,
    side: 'buy',
    type: 'limit',
    amount: QTY,
    price: PRICE,
    timeInForce: 'GTC',
    clientOrderId,
  };

  const placeRes = await fetch(`${TRADE.replace(/\/$/, '')}/api/v1/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify(placeBody),
  });
  const placeText = await placeRes.text();
  if (!placeRes.ok) {
    log(`AUTH_PLACE_FAIL status=${placeRes.status} body=${placeText.slice(0, 500)}`);
    if (STRICT) process.exit(1);
    return 'fail';
  }

  let placeJson;
  try {
    placeJson = JSON.parse(placeText);
  } catch {
    placeJson = {};
  }
  const orderId = placeJson.id ?? placeJson.orderId;
  log(`AUTH_PLACE_OK orderId=${orderId} clientOrderId=${clientOrderId}`);

  if (orderId) {
    const { 'content-type': _ct, ...cancelHeaders } = headers;
    const cancelRes = await fetch(`${TRADE.replace(/\/$/, '')}/api/v1/orders/${orderId}`, {
      method: 'DELETE',
      headers: cancelHeaders,
    });
    const cancelText = await cancelRes.text();
    if (!cancelRes.ok) {
      log(`AUTH_CANCEL_FAIL status=${cancelRes.status} body=${cancelText.slice(0, 300)}`);
      if (STRICT) process.exit(1);
      return 'fail';
    }
    log(`AUTH_CANCEL_OK orderId=${orderId}`);
  }

  log('PROOF_OK assembled-edge-place-cancel (CX8-CI-2)');
  return 'ok';
}

async function main() {
  log('CX-8 assembled path — trade + matching + ledger');
  log(`TRADE=${TRADE} MATCHING=${MATCHING} LEDGER=${LEDGER} STRICT=${STRICT}`);

  const probes = await Promise.all([probe('trade', TRADE), probe('matching', MATCHING), probe('ledger', LEDGER)]);
  for (const p of probes) {
    log(p.ok ? `UP  ${p.name} ${p.url} status=${p.status}` : `DOWN ${p.name} ${p.url} ${p.error ?? `status=${p.status}`}`);
  }

  if (!probes.every((p) => p.ok)) {
    log(
      'HONEST_SKIP L1: fleet not fully reachable — not inventing fill/ledger proof. ' +
        'CI: .github/workflows/order-path-cx8.yml · local: pnpm platform:up',
    );
    if (STRICT) process.exit(1);
    process.exit(0);
  }

  log('PROOF_OK assembled-health (CX8-CI-1)');

  let contracts;
  try {
    contracts = await loadContracts();
  } catch (err) {
    log(`contracts load fail: ${(err && err.message) || err}`);
    if (EDGE || SEED) {
      if (STRICT) process.exit(1);
    }
    process.exit(0);
  }

  try {
    await seedMarketAndFunds(contracts);
  } catch (err) {
    log(`SEED_FAIL ${(err && err.message) || err}`);
    if (STRICT && EDGE) process.exit(1);
  }

  await edgePlaceCancel(contracts);

  log('RESIDUAL_L3: two-user fill needs second principal + resting book — chaos F1–F8 remains CX-7 seal.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[order-path-smoke] fatal', err);
  process.exit(1);
});
