import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  formatAmount,
  parseAmount as amt,
  merchantClearing,
  railBoundary,
  recipes,
  userAvailable,
  type PostRequest,
} from '@intafaced/ledger-client';
import { verifyServiceCall } from '@intafaced/contracts';
import { createLedgerClient } from './ledger-client.js';

/**
 * THE WIRE SHAPE.
 *
 * This client is the only way svc-pay touches a balance (§2, Doctrine §0.6),
 * and the whole of its job is a translation: scaled bigint in memory, decimal
 * string on the wire.
 *
 * The failure mode is loud today — `JSON.stringify` throws on a bigint, so a
 * missed conversion crashes rather than corrupts. That is exactly why this file
 * exists. The temptation, faced with a stack trace about bigints, is to reach
 * for `Number(amount)`, which makes the crash go away and replaces it with a
 * float that silently loses precision above 2^53 and misrepresents 0.1 forever
 * after. These tests pin the shape so that "simplification" fails a test
 * instead of shipping.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const MERCHANT = '55555555-5555-4555-8555-555555555555';

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** The exact bytes that went out. Not a re-serialised object. */
  raw: string;
  body: unknown;
}

const realFetch = globalThis.fetch;
let sent: Captured[];
let respond: (path: string) => { status: number; body: unknown };

beforeEach(() => {
  sent = [];
  respond = () => ({ status: 200, body: { txId: 'tx-1', hash: 'h1', postedAt: '2026-07-27T12:00:00.000Z' } });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const raw = typeof init?.body === 'string' ? init.body : '';
    sent.push({
      url,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      raw,
      body: raw ? JSON.parse(raw) : undefined,
    });

    const { status, body } = respond(new URL(url).pathname);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const SECRET = 'test-internal-service-secret-32-chars';
const client = () => createLedgerClient('http://ledger.test', SECRET);

/** Walk a parsed JSON body and collect every value that is a number. */
function numbersIn(value: unknown, path = '$'): string[] {
  if (typeof value === 'number') return [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => numbersIn(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => numbersIn(v, `${path}.${k}`));
  }
  return [];
}

describe('post — amounts leave as decimal strings', () => {
  it('serialises every entry amount as a decimal string', async () => {
    await client().post(
      recipes.paymentCapture({
        paymentId: 'p-1',
        merchantId: MERCHANT,
        assetId: 'USDT',
        amount: amt('100.5'),
        rail: 'card-sandbox',
        railRef: 'ch_1',
      }),
    );

    const body = sent[0]!.body as { entries: Array<{ amount: unknown; account: unknown; direction: string }> };
    expect(body.entries).toHaveLength(2);
    for (const entry of body.entries) {
      expect(typeof entry.amount).toBe('string');
      expect(entry.amount).toBe('100.5');
    }
  });

  it('puts NO number anywhere in the payload — not one', async () => {
    await client().post(
      recipes.merchantSettlement({
        merchantId: MERCHANT,
        merchantUserId: USER,
        window: '2026-07-27',
        assetId: 'USDT',
        gross: amt('1000'),
        fee: amt('25'),
      }),
    );

    // A blanket check rather than a per-field one: a future field carrying a
    // number would otherwise slip in unnoticed beside the ones asserted above.
    expect(numbersIn(sent[0]!.body)).toEqual([]);
  });

  it('survives JSON at all — a leaked bigint would throw before the request went out', async () => {
    // The regression this guards: dropping `formatAmount` and passing the
    // bigint straight through. `JSON.stringify` throws on bigint, so the
    // failure is loud — but only if something exercises the path.
    await expect(
      client().post(
        recipes.paymentRefund({
          refundId: 'p-1:1',
          paymentId: 'p-1',
          merchantId: MERCHANT,
          merchantUserId: USER,
          assetId: 'USDT',
          amount: amt('40'),
          rail: 'card-sandbox',
          source: 'clearing',
        }),
      ),
    ).resolves.toBeDefined();

    expect(sent[0]!.raw).toContain('"amount":"40"');
  });

  it('preserves 18 decimal places exactly, where a float would not', async () => {
    const dust = '0.000000000000000001';
    await client().post(
      recipes.paymentCapture({
        paymentId: 'p-dust',
        merchantId: MERCHANT,
        assetId: 'USDT',
        amount: amt(dust),
        rail: 'crypto-native',
        railRef: '0x1',
      }),
    );

    const body = sent[0]!.body as { entries: Array<{ amount: string }> };
    expect(body.entries[0]!.amount).toBe(dust);
    // Round-trips back to the same scaled bigint — the property a float breaks.
    expect(amt(body.entries[0]!.amount)).toBe(amt(dust));
  });

  it('preserves a value far beyond what a double can represent', async () => {
    // 2^53 is where Number stops being able to count. The ledger carries 38
    // digits, so this is an ordinary amount to it and an impossible one to a float.
    const huge = '9007199254740993.000000000000000001';
    await client().post({
      idempotencyKey: 'huge-amount-test',
      module: 'pay',
      reason: 'test',
      entries: [
        { account: railBoundary('crypto-native', 'USDT'), direction: 'credit', amount: amt(huge) },
        { account: merchantClearing(MERCHANT, 'USDT'), direction: 'debit', amount: amt(huge) },
      ],
    });

    const body = sent[0]!.body as { entries: Array<{ amount: string }> };
    expect(body.entries[0]!.amount).toBe(huge);
    expect(Number(body.entries[0]!.amount).toString()).not.toBe(huge); // the float would have lost it
  });

  it('sends the business key, module and reason the recipe decided', async () => {
    const request = recipes.merchantSettlement({
      merchantId: MERCHANT,
      merchantUserId: USER,
      window: '2026-07-27',
      assetId: 'USDT',
      gross: amt('100'),
      fee: amt('2'),
    });

    await client().post(request);

    const body = sent[0]!.body as PostRequest;
    // The asset is in the key. Two currencies in one window are two settlements.
    expect(body.idempotencyKey).toBe(`settlement:${MERCHANT}:2026-07-27:USDT`);
    expect(body.module).toBe('pay');
    expect(body.reason).toBe('pay.settled');
  });

  it('posts to the ledger, as JSON, and nowhere else', async () => {
    await client().post(
      recipes.paymentCapture({
        paymentId: 'p-2',
        merchantId: MERCHANT,
        assetId: 'USDT',
        amount: amt('1'),
        rail: 'card-sandbox',
        railRef: 'ch_2',
      }),
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe('http://ledger.test/trpc/post');
    expect(sent[0]!.method).toBe('POST');
    expect(sent[0]!.headers['content-type']).toBe('application/json');
  });

  /**
   * The credential actually leaves the process (§2).
   *
   * Worth its own assertion because the failure mode is silent in the wrong
   * direction: a client that quietly omits these still works against a ledger
   * that is not yet enforcing, and breaks only where it matters. `post` is a
   * `serviceProcedure` now — an unsigned call is refused.
   */
  it('presents service credentials on every call', async () => {
    await client().post(
      recipes.paymentCapture({
        paymentId: 'p-auth',
        merchantId: MERCHANT,
        assetId: 'USDT',
        amount: amt('1'),
        rail: 'card-sandbox',
        railRef: 'ch_auth',
      }),
    );

    const headers = sent[0]!.headers;
    expect(headers['x-intafaced-service']).toBe('svc-pay');
    expect(headers['x-intafaced-service-sig']).toMatch(/^[0-9a-f]{64}$/);

    // Verified against the same secret the ledger would hold, rather than
    // merely asserting the header is present and non-empty.
    expect(
      verifyServiceCall(headers['x-intafaced-service'], headers['x-intafaced-service-ts'], headers['x-intafaced-service-sig'], SECRET)
        .service,
    ).toBe('svc-pay');
  });

  it('normalises a trailing slash on the base URL rather than doubling it', async () => {
    await createLedgerClient('http://ledger.test/', SECRET).post(
      recipes.paymentCapture({
        paymentId: 'p-3',
        merchantId: MERCHANT,
        assetId: 'USDT',
        amount: amt('1'),
        rail: 'card-sandbox',
        railRef: 'ch_3',
      }),
    );
    expect(sent[0]!.url).toBe('http://ledger.test/trpc/post');
  });

  it('returns the ledger transaction with its own id and hash', async () => {
    const tx = await client().post(
      recipes.paymentCapture({
        paymentId: 'p-4',
        merchantId: MERCHANT,
        assetId: 'USDT',
        amount: amt('1'),
        rail: 'card-sandbox',
        railRef: 'ch_4',
      }),
    );

    expect(tx.id).toBe('tx-1');
    expect(tx.hash).toBe('h1');
    expect(tx.idempotencyKey).toBe('payment.capture:p-4');
    expect(tx.postedAt).toEqual(new Date('2026-07-27T12:00:00.000Z'));
  });
});

describe('balances — amounts come back as decimal strings and become bigints', () => {
  it('parses a balance into a scaled bigint', async () => {
    respond = () => ({ status: 200, body: { accountId: 'acc-1', amount: '97.5' } });

    const balance = await client().balance(userAvailable(USER, 'USDT'));

    expect(typeof balance.amount).toBe('bigint');
    expect(balance.amount).toBe(amt('97.5'));
    expect(formatAmount(balance.amount)).toBe('97.5');
  });

  it('parses a clearing balance at full precision', async () => {
    respond = () => ({ status: 200, body: { accountId: 'acc-2', amount: '0.000000000000000001' } });
    const balance = await client().balance(merchantClearing(MERCHANT, 'USDT'));
    expect(balance.amount).toBe(1n);
  });

  it('sends the account reference the recipe would have used', async () => {
    respond = () => ({ status: 200, body: { accountId: 'acc-3', amount: '0' } });
    await client().balance(merchantClearing(MERCHANT, 'USDT'));

    expect(sent[0]!.body).toEqual({
      ownerType: 'module',
      ownerId: `pay:clearing:${MERCHANT}`,
      assetId: 'USDT',
      kind: 'available',
    });
  });

  it('parses every balance in a list', async () => {
    respond = () => ({
      status: 200,
      body: [
        { accountId: 'a', assetId: 'USDT', kind: 'available', amount: '10.5' },
        { accountId: 'b', assetId: 'USDT', kind: 'hold', amount: '2' },
      ],
    });

    const balances = await client().balances('user', USER);

    expect(balances.map((b) => formatAmount(b.amount))).toEqual(['10.5', '2']);
    for (const b of balances) expect(typeof b.amount).toBe('bigint');
    expect(balances[1]!.account).toMatchObject({ ownerType: 'user', ownerId: USER, kind: 'hold' });
  });

  it('refuses a malformed amount instead of coercing it', async () => {
    // A ledger that answered with a float would be a bug in the ledger; the
    // client's job is to refuse it, not to round it into something plausible.
    respond = () => ({ status: 200, body: { accountId: 'acc-4', amount: '97.5e2' } });
    await expect(client().balance(userAvailable(USER, 'USDT'))).rejects.toThrow();
  });
});

describe('errors', () => {
  it('preserves the ledger’s own error code rather than collapsing it', async () => {
    respond = () => ({ status: 422, body: 'ledger.insufficient_funds' });

    // On a refund these mean very different things: insufficient funds is the
    // merchant unable to cover it, frozen is an operator having stopped the
    // module. A caller that cannot tell them apart cannot act on either.
    await expect(
      client().post(
        recipes.paymentRefund({
          refundId: 'p-5:1',
          paymentId: 'p-5',
          merchantId: MERCHANT,
          merchantUserId: USER,
          assetId: 'USDT',
          amount: amt('1'),
          rail: 'card-sandbox',
          source: 'settled',
        }),
      ),
    ).rejects.toThrow(/ledger\.insufficient_funds/);
  });

  it('names the path and the status when the ledger refuses', async () => {
    respond = () => ({ status: 503, body: 'ledger.frozen' });
    await expect(client().balance(userAvailable(USER, 'USDT'))).rejects.toThrow(/\/trpc\/balance failed \(503\)/);
  });

  it('does not pretend to expose transaction lookups it has no endpoint for', async () => {
    // Better to throw than to return null, which would read as "no such
    // transaction" and let a caller conclude a posting never happened.
    await expect(client().getTx('tx-1')).rejects.toThrow(/svc-ledger/);
    await expect(client().getTxByKey('payment.capture:p-1')).rejects.toThrow(/svc-ledger/);
  });
});
