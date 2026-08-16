import { describe, expect, it, vi } from 'vitest';
import { createFixtureSupportDesk, createHttpSupportDeskPort } from './desk-port.js';

const ARTICLE = {
  id: 'kb-account-access',
  titleKey: 'support.kb.account_access.title',
  bodyKey: 'support.kb.account_access.body',
};

describe('createFixtureSupportDesk', () => {
  it('searches fixture rows and invents none', async () => {
    const desk = createFixtureSupportDesk({
      articles: [{ articleKey: ARTICLE.id, titleKey: ARTICLE.titleKey, bodyKey: ARTICLE.bodyKey }],
    });
    expect(await desk.searchKb('account')).toEqual({
      status: 'ok',
      articles: [{ articleKey: ARTICLE.id, titleKey: ARTICLE.titleKey, bodyKey: ARTICLE.bodyKey }],
    });
    expect(await desk.searchKb('definitely-not-an-article-xyz')).toEqual({ status: 'ok', articles: [] });
  });
});

describe('createHttpSupportDeskPort', () => {
  it('searchKb unwraps tRPC articles from the support URL', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain('/trpc/searchKb');
      return new Response(JSON.stringify({ result: { data: [ARTICLE] } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const desk = createHttpSupportDeskPort({
      supportUrl: 'http://support.test',
      internalSecret: 'a'.repeat(32),
      fetchImpl,
    });
    expect(await desk.searchKb('account')).toEqual({
      status: 'ok',
      articles: [{ articleKey: ARTICLE.id, titleKey: ARTICLE.titleKey, bodyKey: ARTICLE.bodyKey }],
    });
  });

  it('searchKb transport failure is unreachable, not invented hits', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    const desk = createHttpSupportDeskPort({
      supportUrl: 'http://support.test',
      internalSecret: 'a'.repeat(32),
      fetchImpl,
    });
    expect(await desk.searchKb('account')).toEqual({ status: 'unreachable' });
  });

  it('readAccount without IDENTITY_URL is unread — never "account is fine"', async () => {
    const desk = createHttpSupportDeskPort({
      supportUrl: 'http://support.test',
      internalSecret: 'a'.repeat(32),
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    expect(await desk.readAccount('11111111-1111-4111-8111-111111111111')).toEqual({ status: 'unread' });
  });

  it('readAccount maps identity projection with no money fields', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain(`/internal/account/${userId}`);
      return new Response(JSON.stringify({ userId, status: 'frozen', kycTier: 'basic' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const desk = createHttpSupportDeskPort({
      supportUrl: 'http://support.test',
      identityUrl: 'http://identity.test',
      internalSecret: 'a'.repeat(32),
      fetchImpl,
    });
    expect(await desk.readAccount(userId)).toEqual({
      status: 'ok',
      account: { userId, status: 'frozen', kycTier: 'basic' },
    });
  });
});
