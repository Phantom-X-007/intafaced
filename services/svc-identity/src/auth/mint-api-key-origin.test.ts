import { describe, expect, it } from 'vitest';
import { apiKeyOriginAllowed } from './api-key-origin.js';
import { mintApiKeyWithOriginAllowlist } from './mint-api-key-origin.js';
import type { ApiKeyMinter } from './mint-api-key-ip.js';

function fakeSql(rows: unknown[] = []) {
  const fn = async () => rows;
  return fn as unknown as Parameters<typeof mintApiKeyWithOriginAllowlist>[1];
}

function makeMinter() {
  const created: unknown[] = [];
  const revoked: string[] = [];
  const minter: ApiKeyMinter = {
    async createApiKey(input) {
      created.push(input);
      return { id: 'k1', key: 'ifk_live_secret', prefix: 'ifk_live', mode: input.mode ?? 'live' };
    },
    async revokeApiKey(_userId, keyId) {
      revoked.push(keyId);
      return true;
    },
  };
  return { minter, created, revoked };
}

const base = {
  userId: 'u',
  name: 'desk',
  scopes: ['identity:read'],
  grantorScopes: ['identity:read', 'identity:write'],
};

describe('mintApiKeyWithOriginAllowlist', () => {
  it('refuses invalid origins before create', async () => {
    const { minter, created } = makeMinter();
    await expect(mintApiKeyWithOriginAllowlist(minter, fakeSql(), { ...base, origins: ['*'] })).rejects.toMatchObject({
      code: 'auth.origin_invalid',
    });
    expect(created).toEqual([]);
  });

  it('binds the list so an unlisted Origin is refused from the first call', async () => {
    const { minter, created, revoked } = makeMinter();
    const minted = await mintApiKeyWithOriginAllowlist(
      minter,
      fakeSql([{ id: 'k1', domain_whitelist: ['app.example.com', 'partner.example'] }]),
      {
        ...base,
        origins: ['  https://app.example.com/dashboard  ', 'https://partner.example'],
      },
    );
    expect(minted.originAllowlist).toEqual(['app.example.com', 'partner.example']);
    expect(created).toHaveLength(1);
    expect(revoked).toEqual([]);
    expect(apiKeyOriginAllowed(minted.originAllowlist, 'https://evil.example')).toBe(false);
    expect(apiKeyOriginAllowed(minted.originAllowlist, undefined)).toBe(false);
    expect(apiKeyOriginAllowed(minted.originAllowlist, 'https://app.example.com')).toBe(true);
  });

  it('empty origins stays unset — does not invent localhost', async () => {
    const { minter, created } = makeMinter();
    const minted = await mintApiKeyWithOriginAllowlist(minter, fakeSql([{ id: 'k1', domain_whitelist: [] }]), {
      ...base,
      origins: [],
    });
    expect(minted.originAllowlist).toEqual([]);
    expect((created[0] as { domainWhitelist: string[] }).domainWhitelist).toEqual([]);
    expect(minted.originAllowlist).not.toContain('localhost');
    expect(apiKeyOriginAllowed(minted.originAllowlist, 'https://evil.example')).toBe(true);
  });

  it('revokes the minted key if bind fails', async () => {
    const { minter, revoked } = makeMinter();
    await expect(mintApiKeyWithOriginAllowlist(minter, fakeSql([]), { ...base, origins: ['app.example.com'] })).rejects.toMatchObject({
      code: 'auth.not_found',
    });
    expect(revoked).toEqual(['k1']);
  });
});
