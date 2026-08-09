import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route.js';

/**
 * BFF gate + not-wired contract for /api/operator-tools.
 */

const ORIGINAL = { ...process.env };

beforeEach(() => {
  for (const key of ['EDGE_URL', 'ADMIN_OPERATOR_TOKEN', 'ADMIN_TREASURY_TOKEN', 'ADMIN_BFF_SHARED_SECRET']) {
    delete process.env[key];
  }
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('GET /api/operator-tools', () => {
  it('lists tools with not-wired when env is missing', async () => {
    const res = await GET(new Request('http://admin.local/api/operator-tools'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tools.length).toBeGreaterThan(5);
    expect(body.tools.every((t: { wire: string }) => t.wire === 'not-wired')).toBe(true);
    expect(body.residual.reconcile).toMatch(/simulated/i);
  });

  it('refuses when BFF shared secret is set and header is wrong', async () => {
    process.env.ADMIN_BFF_SHARED_SECRET = 's3cret';
    const res = await GET(new Request('http://admin.local/api/operator-tools'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('admin.bff_gate');
  });

  it('allows when BFF secret matches header', async () => {
    process.env.ADMIN_BFF_SHARED_SECRET = 's3cret';
    const res = await GET(
      new Request('http://admin.local/api/operator-tools', {
        headers: { 'x-intafaced-admin-bff': 's3cret' },
      }),
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /api/operator-tools', () => {
  it('returns 503 not-wired without calling the network', async () => {
    const fetchMock = vi.fn(() => {
      throw new Error('must not fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(
      new Request('http://admin.local/api/operator-tools', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toolId: 'identity.kyc.pending', input: {} }),
      }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.delivered).toBe(false);
    expect(body.data.wire).toBe('not-wired');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown toolId', async () => {
    process.env.EDGE_URL = 'http://edge:4000';
    process.env.ADMIN_OPERATOR_TOKEN = 'tok';
    const res = await POST(
      new Request('http://admin.local/api/operator-tools', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toolId: 'does.not.exist', input: {} }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it('refuses POST when BFF gate secret is set without header', async () => {
    process.env.ADMIN_BFF_SHARED_SECRET = 's3cret';
    const res = await POST(
      new Request('http://admin.local/api/operator-tools', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toolId: 'identity.kyc.pending' }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
