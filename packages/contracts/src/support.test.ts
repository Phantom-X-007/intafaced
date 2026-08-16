import { describe, expect, it } from 'vitest';
import {
  getKbArticleInputSchema,
  publicKbArticleOrNull,
  publishedKbArticles,
  searchKbInputSchema,
  supportKbArticleSchema,
  type SupportContract,
  type SupportKbArticle,
} from './support.js';

const LIVE: SupportKbArticle = {
  id: 'kb-account-access',
  titleKey: 'support.kb.account_access.title',
  bodyKey: 'support.kb.account_access.body',
  revision: 1,
  published: true,
};

const DRAFT: SupportKbArticle = {
  id: 'kb-draft-only',
  titleKey: 'support.kb.draft_only.title',
  bodyKey: 'support.kb.draft_only.body',
  revision: 2,
  published: false,
};

const SPINE: SupportKbArticle = {
  id: 'kb-security-basics',
  titleKey: 'support.kb.security_basics.title',
  bodyKey: 'support.kb.security_basics.body',
};

function publicKbDoors(catalog: readonly SupportKbArticle[]): Pick<SupportContract, 'listKb' | 'searchKb' | 'getKbArticle'> {
  return {
    async listKb() {
      return publishedKbArticles(catalog);
    },
    async searchKb(query: string) {
      const rows = publishedKbArticles(catalog);
      const q = query.trim().toLowerCase();
      if (!q) return rows;
      return rows.filter(
        (a) => a.id.toLowerCase().includes(q) || a.titleKey.toLowerCase().includes(q) || a.bodyKey.toLowerCase().includes(q),
      );
    },
    async getKbArticle(id: string) {
      return publicKbArticleOrNull(catalog.find((a) => a.id === id) ?? null);
    },
  };
}

describe('supportKbArticleSchema — revision and published', () => {
  it('parses spine rows without revision or published', () => {
    expect(supportKbArticleSchema.parse(SPINE)).toEqual(SPINE);
  });

  it('accepts optional positive revision and boolean published', () => {
    expect(supportKbArticleSchema.parse(LIVE)).toEqual(LIVE);
    expect(supportKbArticleSchema.parse(DRAFT).published).toBe(false);
  });

  it('refuses non-positive revision', () => {
    expect(supportKbArticleSchema.safeParse({ ...SPINE, revision: 0 }).success).toBe(false);
    expect(supportKbArticleSchema.safeParse({ ...SPINE, revision: -1 }).success).toBe(false);
    expect(supportKbArticleSchema.safeParse({ ...SPINE, revision: 1.5 }).success).toBe(false);
  });

  it('accepts optional positive version', () => {
    expect(supportKbArticleSchema.parse({ ...SPINE, version: 1 })).toEqual({ ...SPINE, version: 1 });
    expect(supportKbArticleSchema.safeParse({ ...SPINE, version: 0 }).success).toBe(false);
  });

  it('refuses non-boolean published', () => {
    expect(supportKbArticleSchema.safeParse({ ...SPINE, published: 'yes' }).success).toBe(false);
  });
});

describe('SupportContract searchKb / getKbArticle — public doors', () => {
  const desk = publicKbDoors([LIVE, DRAFT, SPINE]);

  it('searchKb omits unpublished; empty query is the published list', async () => {
    const all = await desk.searchKb('');
    expect(all.map((a) => a.id)).toEqual(['kb-account-access', 'kb-security-basics']);
    const hits = await desk.searchKb('account');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.id).toBe('kb-account-access');
    expect(await desk.searchKb('draft')).toEqual([]);
  });

  it('getKbArticle returns null for unknown and unpublished — it does not throw', async () => {
    await expect(desk.getKbArticle('kb-account-access')).resolves.toEqual(LIVE);
    await expect(desk.getKbArticle('kb-draft-only')).resolves.toBeNull();
    await expect(desk.getKbArticle('kb-does-not-exist')).resolves.toBeNull();
  });

  it('listKb matches search with empty query', async () => {
    expect(await desk.listKb()).toEqual(await desk.searchKb(''));
  });

  it('router inputs match search/get doors', () => {
    expect(searchKbInputSchema.parse(undefined)).toBeUndefined();
    expect(searchKbInputSchema.parse({ q: 'account' })).toEqual({ q: 'account' });
    expect(getKbArticleInputSchema.parse({ id: 'kb-account-access' }).id).toBe('kb-account-access');
    expect(getKbArticleInputSchema.parse({ id: 'kb-account-access', version: 2 })).toEqual({
      id: 'kb-account-access',
      version: 2,
    });
    expect(getKbArticleInputSchema.safeParse({ id: '' }).success).toBe(false);
    expect(getKbArticleInputSchema.safeParse({ id: 'kb-account-access', version: 0 }).success).toBe(false);
  });
});
