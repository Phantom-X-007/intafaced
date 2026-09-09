import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SERVICE_BODY_DIGEST_HEADER, SERVICE_SIGNATURE_HEADER, type SubAccountOwnership } from '@intafaced/contracts';
import { TradeError } from './types.js';
import { assertSubAccountOwned, createSubAccountOwnershipClient, type SubAccountOwnershipSource } from './sub-account-ownership.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SUB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function source(row: SubAccountOwnership | null, unavailable = false): SubAccountOwnershipSource {
  return {
    async get() {
      if (unavailable) throw new TradeError('down', 'trade.sub_account_unavailable');
      return row;
    },
  };
}

describe('assertSubAccountOwned', () => {
  it('allows an active book owned by the principal', async () => {
    await expect(assertSubAccountOwned(source({ id: SUB, parentUserId: OWNER, revoked: false }), OWNER, SUB)).resolves.toBeUndefined();
  });

  it('denies a missing id (same code as foreign — no existence leak)', async () => {
    await expect(assertSubAccountOwned(source(null), OWNER, SUB)).rejects.toMatchObject({
      code: 'trade.sub_account_denied',
    });
  });

  it('denies a foreign parent with the same code as missing', async () => {
    await expect(assertSubAccountOwned(source({ id: SUB, parentUserId: OTHER, revoked: false }), OWNER, SUB)).rejects.toMatchObject({
      code: 'trade.sub_account_denied',
    });
  });

  it('refuses a revoked book the principal owns', async () => {
    await expect(assertSubAccountOwned(source({ id: SUB, parentUserId: OWNER, revoked: true }), OWNER, SUB)).rejects.toMatchObject({
      code: 'trade.sub_account_revoked',
    });
  });

  it('propagates identity unavailable (fail closed)', async () => {
    await expect(assertSubAccountOwned(source(null, true), OWNER, SUB)).rejects.toMatchObject({
      code: 'trade.sub_account_unavailable',
    });
  });
});

const SECRET = 'sub-account-test-internal-secret-32ch';
const EMPTY_DIGEST = createHash('sha256').update('', 'utf8').digest('hex');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createSubAccountOwnershipClient — body-bound GET', () => {
  it('signs the empty body and does not send one', async () => {
    let method = '';
    let url = '';
    let requestBody: unknown;
    let requestHeaders: HeadersInit | undefined;
    const row: SubAccountOwnership = { id: SUB, parentUserId: OWNER, revoked: false };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input);
        method = String(init?.method);
        requestBody = init?.body;
        requestHeaders = init?.headers;
        return new Response(JSON.stringify(row), { status: 200, headers: { 'content-type': 'application/json' } });
      }),
    );

    await expect(createSubAccountOwnershipClient('http://identity.example', SECRET).get(SUB)).resolves.toEqual(row);

    expect(method).toBe('GET');
    expect(url).toBe(`http://identity.example/internal/sub-accounts/${SUB}`);
    expect(requestBody).toBeUndefined();
    const headers = new Headers(requestHeaders);
    expect(headers.get(SERVICE_BODY_DIGEST_HEADER)).toBe(EMPTY_DIGEST);
    expect(headers.get(SERVICE_SIGNATURE_HEADER)).toBeTruthy();
  });

  it('returns null on 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('missing', { status: 404 })),
    );
    await expect(createSubAccountOwnershipClient('http://identity.example', SECRET).get(SUB)).resolves.toBeNull();
  });

  it('fails closed on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unauthenticated', { status: 401 })),
    );
    await expect(createSubAccountOwnershipClient('http://identity.example', SECRET).get(SUB)).rejects.toMatchObject({
      code: 'trade.sub_account_unavailable',
    });
  });
});
