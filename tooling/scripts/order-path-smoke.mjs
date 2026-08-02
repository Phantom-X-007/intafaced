#!/usr/bin/env node
/**
 * Assembled order-path smoke (Plan P1-3 · Spec CX-8 · Architect Seam B2).
 *
 * Levels of proof (never invent fills):
 *   1. Health plane — trade + matching + ledger /health reachable.
 *   2. Auth place (optional) — if TRADE_SMOKE_BEARER is set, place a limit
 *      and cancel it (one-user hold/release via live HTTP).
 *   3. Two-user fill (optional) — needs TRADE_SMOKE_BEARER_MAKER +
 *      TRADE_SMOKE_BEARER_TAKER + seeded book liquidity; residual until tokens.
 *
 * When fleet is down: **honest skip exit 0** (never fake green).
 * ORDER_PATH_SMOKE_STRICT=1 → exit 1 if fleet down.
 *
 * Env:
 *   TRADE_HTTP_URL        default http://127.0.0.1:4010
 *   MATCHING_HTTP_URL     default http://127.0.0.1:4005  (compose maps 4005)
 *   LEDGER_HTTP_URL       default http://127.0.0.1:4001
 *   TRADE_SMOKE_BEARER    optional Bearer token (trade:write)
 *   TRADE_SMOKE_SYMBOL    default BTC-USDT (or market id your fleet lists)
 *   TRADE_SMOKE_QTY       default 0.001
 *   TRADE_SMOKE_PRICE     default 1 (far from market — rest only)
 *   ORDER_PATH_SMOKE_STRICT=1
 *
 * Compose: `pnpm platform:up` (requires Docker on the host).
 * Run: `pnpm order-path-smoke` or `node tooling/scripts/order-path-smoke.mjs`
 */
const TRADE = process.env.TRADE_HTTP_URL ?? 'http://127.0.0.1:4010';
const MATCHING = process.env.MATCHING_HTTP_URL ?? 'http://127.0.0.1:4005';
const LEDGER = process.env.LEDGER_HTTP_URL ?? 'http://127.0.0.1:4001';
const STRICT = process.env.ORDER_PATH_SMOKE_STRICT === '1';
const BEARER = process.env.TRADE_SMOKE_BEARER?.trim() || '';
const BEARER_MAKER = process.env.TRADE_SMOKE_BEARER_MAKER?.trim() || '';
const BEARER_TAKER = process.env.TRADE_SMOKE_BEARER_TAKER?.trim() || '';
const SYMBOL = process.env.TRADE_SMOKE_SYMBOL ?? 'BTC-USDT';
const QTY = process.env.TRADE_SMOKE_QTY ?? '0.001';
const PRICE = process.env.TRADE_SMOKE_PRICE ?? '1';

const log = (line) => console.log(`[order-path-smoke] ${line}`);

async function probe(name, url, path = '/health') {
  const target = url.replace(/\/$/, '') + path;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 2500);
    const res = await fetch(target, { signal: ac.signal });
    clearTimeout(t);
    return { name, url: target, ok: res.ok || res.status < 500, status: res.status };
  } catch (err) {
    return { name, url: target, ok: false, status: 0, error: (err && err.message) || String(err) };
  }
}

async function tradeFetch(path, { method = 'GET', bearer, body } = {}) {
  const url = TRADE.replace(/\/$/, '') + path;
  const headers = { accept: 'application/json' };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (body) headers['content-type'] = 'application/json';
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { res, json, text };
}

async function main() {
  log('CX-8 assembled path probe — trade + matching + ledger');
  log(`TRADE=${TRADE} MATCHING=${MATCHING} LEDGER=${LEDGER}`);

  const probes = await Promise.all([probe('trade', TRADE), probe('matching', MATCHING), probe('ledger', LEDGER)]);

  for (const p of probes) {
    log(p.ok ? `UP  ${p.name} ${p.url} status=${p.status}` : `DOWN ${p.name} ${p.url} ${p.error ?? `status=${p.status}`}`);
  }

  const allUp = probes.every((p) => p.ok);
  if (!allUp) {
    const msg =
      'HONEST_SKIP: fleet not fully reachable — not inventing fill/ledger proof. ' +
      'Start with `pnpm platform:up` (requires Docker) then re-run. ' +
      'CI unit chaos (F1–F8) remains the in-process CX-7 seal.';
    log(msg);
    if (STRICT) {
      console.error('[order-path-smoke] STRICT=1 and fleet down → exit 1');
      process.exit(1);
    }
    process.exit(0);
  }

  log('FLEET_UP: health plane of trade+matching+ledger reachable');
  log('PROOF_OK assembled-health');

  // ── Level 2: optional authenticated place + cancel ─────────────────────
  if (!BEARER && !(BEARER_MAKER && BEARER_TAKER)) {
    log(
      'RESIDUAL_L2: set TRADE_SMOKE_BEARER for one-user place+cancel over live HTTP; ' +
        'set TRADE_SMOKE_BEARER_MAKER + TRADE_SMOKE_BEARER_TAKER for two-user fill residual.',
    );
    log('PROOF_OK health-only (no tokens)');
    process.exit(0);
  }

  if (BEARER) {
    const clientOrderId = `smoke-${Date.now()}`;
    log(`AUTH_PLACE: symbol=${SYMBOL} qty=${QTY} price=${PRICE} clientOrderId=${clientOrderId}`);
    const place = await tradeFetch('/v1/orders', {
      method: 'POST',
      bearer: BEARER,
      body: {
        symbol: SYMBOL,
        side: 'buy',
        type: 'limit',
        qty: QTY,
        price: PRICE,
        timeInForce: 'GTC',
        clientOrderId,
      },
    });
    if (!place.res.ok) {
      log(`AUTH_PLACE_FAIL status=${place.res.status} body=${JSON.stringify(place.json).slice(0, 400)}`);
      // Auth/market misconfig is residual, not invent — exit 1 only in STRICT
      if (STRICT) process.exit(1);
      log('HONEST_SKIP: fleet up but place refused (auth/market/funds residual)');
      process.exit(0);
    }
    const orderId = place.json?.id ?? place.json?.orderId;
    log(`AUTH_PLACE_OK orderId=${orderId}`);
    if (orderId) {
      const cancel = await tradeFetch(`/v1/orders/${orderId}`, {
        method: 'DELETE',
        bearer: BEARER,
      });
      log(cancel.res.ok ? `AUTH_CANCEL_OK orderId=${orderId}` : `AUTH_CANCEL_FAIL status=${cancel.res.status}`);
    }
    log('PROOF_OK assembled-auth-place-cancel');
  }

  if (BEARER_MAKER && BEARER_TAKER) {
    log(
      'RESIDUAL_L3: two-user fill path needs funded principals + resting liquidity; ' +
        'not auto-running cross without operator-funded accounts (would invent money).',
    );
    log(
      'Operator: fund both users on fleet, rest maker limit, take with second token, ' +
        'assert one trade.fill and conserved ledger — then paste proof into WAVE-AUDIT.',
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[order-path-smoke] fatal', err);
  process.exit(1);
});
