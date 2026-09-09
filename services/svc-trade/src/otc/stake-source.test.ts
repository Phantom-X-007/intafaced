import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { SERVICE_BODY_DIGEST_HEADER, SERVICE_SIGNATURE_HEADER } from '@intafaced/contracts';
import { createOtcStakeSource } from './stake-source.js';
import { OtcError } from './errors.js';

const SECRET = 'otc-stake-test-internal-secret-32ch!!';
const USER = '11111111-1111-4111-8111-111111111111';
const EMPTY_DIGEST = createHash('sha256').update('', 'utf8').digest('hex');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createOtcStakeSource — body-bound GET', () => {
  it('signs the empty body and does not send one', async () => {
    let method = '';
    let url = '';
    let requestBody: unknown;
    let requestHeaders: HeadersInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        url = String(input);
        method = String(init?.method);
        requestBody = init?.body;
        requestHeaders = init?.headers;
        return new Response(JSON.stringify({ staked: '1000' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }),
    );

    await expect(createOtcStakeSource('http://token.example', SECRET).stakeOf(USER)).resolves.toEqual(parseAmount('1000'));

    expect(method).toBe('GET');
    expect(url).toBe(`http://token.example/internal/stake/${USER}`);
    expect(requestBody).toBeUndefined();
    const headers = new Headers(requestHeaders);
    expect(headers.get(SERVICE_BODY_DIGEST_HEADER)).toBe(EMPTY_DIGEST);
    expect(headers.get(SERVICE_SIGNATURE_HEADER)).toBeTruthy();
  });

  it('fails closed on 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 500 })),
    );
    await expect(createOtcStakeSource('http://token.example', SECRET).stakeOf(USER)).rejects.toBeInstanceOf(OtcError);
    await expect(createOtcStakeSource('http://token.example', SECRET).stakeOf(USER)).rejects.toMatchObject({
      code: 'trade.otc_stake_unavailable',
    });
  });

  it('fails closed on an unusable payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ staked: 1000 }), { status: 200 })),
    );
    await expect(createOtcStakeSource('http://token.example', SECRET).stakeOf(USER)).rejects.toMatchObject({
      code: 'trade.otc_stake_unavailable',
    });
  });
});
