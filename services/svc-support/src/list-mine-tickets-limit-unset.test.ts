import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LIST_MINE_LIMIT_UNSET, SupportError, SupportService, assertListMineTicketsLimit } from './support-service.js';
import { userCopy } from './user-copy.js';

/**
 * listMine page size is refuse-closed when unset.
 *
 * listMyTickets called store.listByUser() with no page, so omit dumped every
 * ticket for the caller. Blank must refuse. Owner/client may pass 100 explicitly.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const USER = '11111111-1111-4111-8111-111111111111';

describe('listMine limit unset refuse', () => {
  it('assertListMineTicketsLimit refuses blank / NaN / 0 — never invents 100', () => {
    expect(() => assertListMineTicketsLimit(undefined)).toThrow(SupportError);
    expect(() => assertListMineTicketsLimit(Number.NaN)).toThrow(SupportError);
    expect(() => assertListMineTicketsLimit(0)).toThrow(SupportError);
    try {
      assertListMineTicketsLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(SupportError);
      expect((e as SupportError).code).toBe(LIST_MINE_LIMIT_UNSET);
      expect((e as SupportError).message).not.toMatch(/100-row|default 100/i);
      expect(userCopy((e as SupportError).code)).toBe(LIST_MINE_LIMIT_UNSET);
      expect(userCopy((e as SupportError).code)).not.toMatch(/100-row|default 100/i);
    }
  });

  it('accepts owner-published 100 and caps at existing door max 500', () => {
    expect(assertListMineTicketsLimit(100)).toBe(100);
    expect(assertListMineTicketsLimit(1)).toBe(1);
    expect(assertListMineTicketsLimit(500)).toBe(500);
    expect(assertListMineTicketsLimit(501)).toBe(500);
  });

  it('listMyTickets omit refuses; explicit 100 pages; never dumps the table', async () => {
    const svc = new SupportService();
    for (let i = 0; i < 3; i += 1) {
      await svc.createTicket({
        userId: USER,
        category: 'other',
        subject: `S${i}`,
        body: 'B',
      });
    }
    await expect(svc.listMyTickets({ userId: USER })).rejects.toMatchObject({ code: LIST_MINE_LIMIT_UNSET });
    await expect(svc.listMyTickets({ userId: USER, limit: undefined })).rejects.toMatchObject({
      code: LIST_MINE_LIMIT_UNSET,
    });
    const page = await svc.listMyTickets({ userId: USER, limit: 100 });
    expect(page).toHaveLength(3);
    const one = await svc.listMyTickets({ userId: USER, limit: 1 });
    expect(one).toHaveLength(1);
  });

  it('router does not invent 100 when listMine omits limit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-support/src/router.ts'), 'utf8');
    const start = src.indexOf('listMine:');
    const end = src.indexOf('listAll:', start);
    const fn = src.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain('listMyTickets({ userId: ctx.principal!.userId, limit: input?.limit })');
    expect(fn).not.toMatch(/input\?\.limit \?\? 100/);
    expect(fn).not.toMatch(/\?\? 100/);
  });

  it('listMyTickets no longer dumps store.listByUser() without a page', () => {
    const src = readFileSync(join(ROOT, 'services/svc-support/src/support-service.ts'), 'utf8');
    const start = src.indexOf('async listMyTickets(');
    const end = src.indexOf('async listAllTickets(', start);
    const fn = src.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain('assertListMineTicketsLimit');
    expect(fn).toContain('this.store.listByUser(input.userId, { limit })');
    expect(fn).not.toMatch(/this\.store\.listByUser\(input\.userId\)/);
    expect(fn).not.toMatch(/\?\? 100/);
  });
});
