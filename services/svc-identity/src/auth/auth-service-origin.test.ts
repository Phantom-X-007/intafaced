import { describe, expect, it } from 'vitest';
import { ApiKeyOriginError, bindApiKeyOriginAllowlist } from './auth-service-origin.js';

function fakeSql(rows: unknown[] = []) {
  const fn = async () => rows;
  return fn as unknown as Parameters<typeof bindApiKeyOriginAllowlist>[0];
}

describe('bindApiKeyOriginAllowlist', () => {
  it('refuses invalid origins and does not write', async () => {
    await expect(bindApiKeyOriginAllowlist(fakeSql(), 'u', 'k', ['*'])).rejects.toMatchObject({
      code: 'auth.origin_invalid',
    });
    await expect(bindApiKeyOriginAllowlist(fakeSql(), 'u', 'k', ['https://app.example.com', '   '])).rejects.toBeInstanceOf(
      ApiKeyOriginError,
    );
  });

  it('returns the bound list and treats a missing key as not found', async () => {
    const ok = fakeSql([{ id: 'k', domain_whitelist: ['app.example.com'] }]);
    await expect(bindApiKeyOriginAllowlist(ok, 'u', 'k', ['  https://app.example.com/dashboard  '])).resolves.toEqual({
      id: 'k',
      originAllowlist: ['app.example.com'],
    });
    await expect(bindApiKeyOriginAllowlist(fakeSql([]), 'u', 'k', ['app.example.com'])).rejects.toMatchObject({
      code: 'auth.not_found',
    });
  });

  it('empty list stays unset — does not invent localhost', async () => {
    const ok = fakeSql([{ id: 'k', domain_whitelist: [] }]);
    await expect(bindApiKeyOriginAllowlist(ok, 'u', 'k', [])).resolves.toEqual({
      id: 'k',
      originAllowlist: [],
    });
  });
});
