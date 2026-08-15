import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assertKbArticle, getKbById, KbCatalogError, listPlatformKb, PLATFORM_KB_SPINE, searchKb } from './kb-catalog.js';
import { SupportError, SupportService } from './support-service.js';

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

describe('ops.kb-workflow Stage-1 published catalog', () => {
  const USER = '11111111-1111-4111-8111-111111111111';
  const OP = '33333333-3333-4333-8333-333333333333';

  it('listKb omits unpublished revisions', async () => {
    const svc = new SupportService();
    const before = await svc.listKb();
    expect(before.some((a) => a.id === 'kb-paper-vs-live')).toBe(true);
    await svc.unpublishKb({ id: 'kb-paper-vs-live', baseRevision: 1 });
    const after = await svc.listKb();
    expect(after.some((a) => a.id === 'kb-paper-vs-live')).toBe(false);
    expect(after.every((a) => a.published === true)).toBe(true);
    expect(after.length).toBe(before.length - 1);
  });

  it('getKb returns null for unpublished, never invents', async () => {
    const svc = new SupportService();
    expect(await svc.getKbArticle('kb-orders-status')).not.toBeNull();
    await svc.unpublishKb({ id: 'kb-orders-status', baseRevision: 1 });
    expect(await svc.getKbArticle('kb-orders-status')).toBeNull();
    expect(await svc.getKbArticle('kb-invented-never-existed')).toBeNull();
  });

  it('searchKb empty query returns published only', async () => {
    const svc = new SupportService();
    await svc.unpublishKb({ id: 'kb-security-basics', baseRevision: 1 });
    const empty = await svc.searchKb('');
    expect(empty.every((a) => a.published === true)).toBe(true);
    expect(empty.some((a) => a.id === 'kb-security-basics')).toBe(false);
    expect(empty.length).toBe((await svc.listKb()).length);
  });

  it('escalate citing unpublished id contributes no citation', async () => {
    const svc = new SupportService();
    const ticket = await svc.createTicket({
      userId: USER,
      category: 'other',
      subject: 'S',
      body: 'B',
    });
    await svc.comment({ userId: USER, ticketId: ticket.id, body: 'still stuck' });
    await svc.unpublishKb({ id: 'kb-account-access', baseRevision: 1 });
    const file = await svc.escalate({
      operatorId: OP,
      ticketId: ticket.id,
      reason: 'technical',
      summary: 'Citing a draft by mistake.',
      citedArticleIds: ['kb-account-access'],
    });
    expect(file.citations.map((c) => c.kind)).toEqual(['ticket_comment']);
  });

  it('publishKb bumps revision and refuses stale baseRevision', async () => {
    const svc = new SupportService();
    const bumped = await svc.publishKb({
      id: 'kb-account-access',
      titleKey: 'support.kb.account_access.title',
      bodyKey: 'support.kb.account_access.body',
      baseRevision: 1,
    });
    expect(bumped.revision).toBe(2);
    expect(bumped.published).toBe(true);
    await expect(
      svc.publishKb({
        id: 'kb-account-access',
        titleKey: 'support.kb.account_access.title',
        bodyKey: 'support.kb.account_access.body',
        baseRevision: 1,
      }),
    ).rejects.toMatchObject({ code: 'support.kb.revision_stale' });
    const still = await svc.getKbArticle('kb-account-access');
    expect(still?.revision).toBe(2);
  });

  it('unpublishKb hides the article on public listKb', async () => {
    const svc = new SupportService();
    await svc.unpublishKb({ id: 'kb-deposit-withdraw-honest', baseRevision: 1 });
    expect((await svc.listKb()).some((a) => a.id === 'kb-deposit-withdraw-honest')).toBe(false);
    expect(await svc.getKbArticle('kb-deposit-withdraw-honest')).toBeNull();
  });

  it('assertKbArticle still refuses vendor keys after persist', async () => {
    const svc = new SupportService();
    await expect(
      svc.publishKb({
        id: 'kb-binance-help',
        titleKey: 'support.kb.binance.title',
        bodyKey: 'support.kb.binance.body',
        baseRevision: 0,
      }),
    ).rejects.toBeInstanceOf(SupportError);
    await expect(
      svc.publishKb({
        id: 'kb-binance-help',
        titleKey: 'support.kb.binance.title',
        bodyKey: 'support.kb.binance.body',
        baseRevision: 0,
      }),
    ).rejects.toMatchObject({ code: 'support.kb_vendor_name' });
    expect(await svc.getKbArticle('kb-binance-help')).toBeNull();
    expect((await svc.listKb()).some((a) => a.id.includes('binance'))).toBe(false);
  });

  it('kb_articles table has no amount/balance/currency column', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const sql = readFileSync(join(here, '..', 'drizzle', '0003_kb_articles.sql'), 'utf8');
    const create = sql.slice(sql.indexOf('CREATE TABLE'), sql.indexOf(';', sql.indexOf('CREATE TABLE')) + 1);
    expect(create.toLowerCase()).not.toMatch(/\bamount\b/);
    expect(create.toLowerCase()).not.toMatch(/\bbalance\b/);
    expect(create.toLowerCase()).not.toMatch(/\bcurrency\b/);
    expect(create).toMatch(/title_key/);
    expect(create).toMatch(/revision/);
    expect(create).toMatch(/published/);
  });
});
