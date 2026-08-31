import { afterEach, describe, expect, it } from 'vitest';
import { adminBffGate } from './admin-bff-gate';

const original = process.env.ADMIN_BFF_SHARED_SECRET;

afterEach(() => {
  if (original === undefined) delete process.env.ADMIN_BFF_SHARED_SECRET;
  else process.env.ADMIN_BFF_SHARED_SECRET = original;
});

describe('adminBffGate', () => {
  it.each([undefined, '', '   '])('refuses closed when configuration is %j', async (value) => {
    if (value === undefined) delete process.env.ADMIN_BFF_SHARED_SECRET;
    else process.env.ADMIN_BFF_SHARED_SECRET = value;

    const response = adminBffGate(new Request('https://admin.example/api/kill-switch'));
    expect(response?.status).toBe(503);
    expect(await response?.json()).toMatchObject({ code: 'admin.bff_gate_unconfigured' });
  });

  it('refuses a missing or wrong credential without echoing either secret', async () => {
    process.env.ADMIN_BFF_SHARED_SECRET = 'expected-secret';
    const response = adminBffGate(
      new Request('https://admin.example/api/kill-switch', {
        headers: { 'x-intafaced-admin-bff': 'wrong-secret' },
      }),
    );
    expect(response?.status).toBe(401);
    const body = JSON.stringify(await response?.json());
    expect(body).not.toContain('expected-secret');
    expect(body).not.toContain('wrong-secret');
  });

  it('allows a configured matching credential', () => {
    process.env.ADMIN_BFF_SHARED_SECRET = ' expected-secret ';
    const response = adminBffGate(
      new Request('https://admin.example/api/kill-switch', {
        headers: { 'x-intafaced-admin-bff': ' expected-secret ' },
      }),
    );
    expect(response).toBeNull();
  });

  it.each([
    ['origin', 'https://evil.example'],
    ['sec-fetch-site', 'cross-site'],
    ['origin', 'not a URL'],
  ] as const)('refuses cross-origin browser mutations for %s', async (header, value) => {
    process.env.ADMIN_BFF_SHARED_SECRET = 'expected-secret';
    const headers = new Headers({ 'x-intafaced-admin-bff': 'expected-secret' });
    headers.set(header, value);
    const response = adminBffGate(
      new Request('https://admin.example/api/kill-switch', {
        method: 'POST',
        headers,
      }),
    );
    expect(response?.status).toBe(403);
    expect(await response?.json()).toMatchObject({ code: 'admin.bff_gate_origin' });
  });

  it('allows a same-origin browser mutation and a non-browser proxy call', () => {
    process.env.ADMIN_BFF_SHARED_SECRET = 'expected-secret';
    const headers = { 'x-intafaced-admin-bff': 'expected-secret' };

    expect(
      adminBffGate(
        new Request('https://admin.example/api/kill-switch', {
          method: 'POST',
          headers: { ...headers, origin: 'https://admin.example' },
        }),
      ),
    ).toBeNull();
    expect(adminBffGate(new Request('https://admin.example/api/kill-switch', { method: 'POST', headers }))).toBeNull();
  });
});
