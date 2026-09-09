import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SERVICE_BODY_DIGEST_HEADER,
  SERVICE_HEADER,
  SERVICE_SIGNATURE_HEADER,
  SERVICE_TIMESTAMP_HEADER,
  verifyServiceHeaders,
} from '@intafaced/contracts';
import { parseAmount } from '@intafaced/ledger-client';
import { createStakeSource } from './stake-source.js';

const SECRET = 'an-academy-stake-source-test-secret';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createStakeSource — S2S body bind', () => {
  it('signs the GET with v2 headers bound to empty bytes', async () => {
    let seen: Record<string, string> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        seen = init.headers as Record<string, string>;
        expect(init.body).toBeUndefined();
        return new Response(JSON.stringify({ staked: '0' }), { status: 200 });
      }),
    );

    const amount = await createStakeSource('http://svc-token:4010', SECRET).stakeOf('u-1');
    expect(amount).toEqual(parseAmount('0'));

    expect(seen[SERVICE_HEADER]).toBe('svc-academy');
    expect(seen[SERVICE_BODY_DIGEST_HEADER]).toMatch(/^[0-9a-f]{64}$/);
    expect(seen[SERVICE_SIGNATURE_HEADER]).toMatch(/^[0-9a-f]{64}$/);
    expect(seen[SERVICE_TIMESTAMP_HEADER]).toMatch(/^\d+$/);
    expect(
      verifyServiceHeaders(seen, SECRET, {
        rawBody: { retained: true, bytes: Buffer.alloc(0) },
        mode: 'require',
      }),
    ).toEqual({ service: 'svc-academy', rejected: null, scheme: 'v2' });
  });
});
