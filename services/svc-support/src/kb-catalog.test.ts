import { describe, expect, it } from 'vitest';
import { assertKbArticle, getKbById, KbCatalogError, listPlatformKb, PLATFORM_KB_SPINE, searchKb } from './kb-catalog.js';

describe('support Stage-2 KB catalog', () => {
  it('spine is non-empty and vendor-clean', () => {
    const list = listPlatformKb();
    expect(list.length).toBeGreaterThanOrEqual(5);
    expect(list.every((a) => a.titleKey.startsWith('support.kb.'))).toBe(true);
    for (const a of list) {
      expect(a).not.toHaveProperty('balance');
      expect(a).not.toHaveProperty('refundAmount');
    }
  });

  it('search finds by id fragment; unknown returns empty not invent', () => {
    expect(searchKb('account').some((a) => a.id === 'kb-account-access')).toBe(true);
    expect(searchKb('definitely-not-an-article-xyz')).toEqual([]);
    expect(searchKb('').length).toBe(PLATFORM_KB_SPINE.length);
  });

  it('getKbById null when missing', () => {
    expect(getKbById('kb-account-access')?.titleKey).toContain('account_access');
    expect(getKbById('nope')).toBeNull();
  });

  it('refuses vendor-named keys', () => {
    expect(() =>
      assertKbArticle({
        id: 'kb-binance-help',
        titleKey: 'support.kb.binance.title',
        bodyKey: 'support.kb.binance.body',
      }),
    ).toThrow(KbCatalogError);
  });

  it('refuses keys outside support.kb.*', () => {
    expect(() =>
      assertKbArticle({
        id: 'x',
        titleKey: 'other.foo',
        bodyKey: 'support.kb.ok.body',
      }),
    ).toThrow(KbCatalogError);
  });
});
