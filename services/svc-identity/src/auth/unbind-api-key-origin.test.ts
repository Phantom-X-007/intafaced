import { describe, expect, it } from 'vitest';
import { ApiKeyOriginError } from './auth-service-origin.js';
import { apiKeyOriginAllowed } from './api-key-origin.js';
import { unbindApiKeyOriginAllowlist } from './unbind-api-key-origin.js';

const KEY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LISTED = 'app.example.com';
const KEEP = 'partner.example';

function fakeSqlSequence(results: unknown[][]) {
  let i = 0;
  const fn = async () => results[Math.min(i++, results.length - 1)] ?? [];
  return fn as unknown as Parameters<typeof unbindApiKeyOriginAllowlist>[0];
}

describe('unbindApiKeyOriginAllowlist', () => {
  it('removes one listed origin and leaves the rest', async () => {
    const sql = fakeSqlSequence([[{ id: KEY, domain_whitelist: [LISTED, KEEP] }], [{ id: KEY, domain_whitelist: [KEEP] }]]);
    await expect(unbindApiKeyOriginAllowlist(sql, USER, KEY, ` https://${LISTED}/path `)).resolves.toEqual({
      id: KEY,
      originAllowlist: [KEEP],
    });
  });

  it('a place from the unbound Origin is then refused; a still-listed Origin stays open', async () => {
    const sql = fakeSqlSequence([[{ id: KEY, domain_whitelist: [LISTED, KEEP] }], [{ id: KEY, domain_whitelist: [KEEP] }]]);
    const { originAllowlist } = await unbindApiKeyOriginAllowlist(sql, USER, KEY, LISTED);
    expect(apiKeyOriginAllowed(originAllowlist, `https://${LISTED}`)).toBe(false);
    expect(apiKeyOriginAllowed(originAllowlist, `https://${KEEP}`)).toBe(true);
  });

  it('refuses invalid origins, a missing key, and an origin that is not on the list', async () => {
    await expect(unbindApiKeyOriginAllowlist(fakeSqlSequence([[]]), USER, KEY, '*')).rejects.toMatchObject({
      code: 'auth.origin_invalid',
    });
    await expect(unbindApiKeyOriginAllowlist(fakeSqlSequence([[]]), USER, KEY, LISTED)).rejects.toBeInstanceOf(ApiKeyOriginError);
    await expect(
      unbindApiKeyOriginAllowlist(fakeSqlSequence([[{ id: KEY, domain_whitelist: [KEEP] }]]), USER, KEY, LISTED),
    ).rejects.toMatchObject({
      code: 'auth.not_found',
    });
  });
});
