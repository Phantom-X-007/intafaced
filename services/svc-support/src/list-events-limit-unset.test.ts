import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LIST_EVENTS_LIMIT_UNSET, SupportError, SupportService, assertListEventsLimit } from './support-service.js';
import { userCopy } from './user-copy.js';

/**
 * events / listTicketEvents page size is refuse-closed when unset.
 *
 * listTicketEvents called store.listEvents(ticketId) with no page, so omit
 * dumped every trail row. Blank must refuse. Owner/client may pass 100
 * explicitly.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const USER = '11111111-1111-4111-8111-111111111111';
const OP = '33333333-3333-4333-8333-333333333333';

describe('listTicketEvents limit unset refuse', () => {
  it('assertListEventsLimit refuses blank / NaN / 0 — never invents 100', () => {
    expect(() => assertListEventsLimit(undefined)).toThrow(SupportError);
    expect(() => assertListEventsLimit(Number.NaN)).toThrow(SupportError);
    expect(() => assertListEventsLimit(0)).toThrow(SupportError);
    try {
      assertListEventsLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(SupportError);
      expect((e as SupportError).code).toBe(LIST_EVENTS_LIMIT_UNSET);
      expect((e as SupportError).message).not.toMatch(/100-row|default 100/i);
      expect(userCopy((e as SupportError).code)).toBe(LIST_EVENTS_LIMIT_UNSET);
      expect(userCopy((e as SupportError).code)).not.toMatch(/100-row|default 100/i);
    }
  });

  it('accepts owner-published 100 and caps at existing door max 500', () => {
    expect(assertListEventsLimit(100)).toBe(100);
    expect(assertListEventsLimit(1)).toBe(1);
    expect(assertListEventsLimit(500)).toBe(500);
    expect(assertListEventsLimit(501)).toBe(500);
  });

  it('listTicketEvents omit refuses; explicit 100 pages; never dumps the trail', async () => {
    const svc = new SupportService();
    const ticket = await svc.createTicket({
      userId: USER,
      category: 'other',
      subject: 'S',
      body: 'B',
    });
    await svc.setStatus({ operatorId: OP, ticketId: ticket.id, status: 'pending' });
    await svc.setStatus({ operatorId: OP, ticketId: ticket.id, status: 'resolved' });
    await expect(svc.listTicketEvents({ userId: USER, ticketId: ticket.id })).rejects.toMatchObject({
      code: LIST_EVENTS_LIMIT_UNSET,
    });
    await expect(svc.listTicketEvents({ userId: USER, ticketId: ticket.id, limit: undefined })).rejects.toMatchObject({
      code: LIST_EVENTS_LIMIT_UNSET,
    });
    const page = await svc.listTicketEvents({ userId: USER, ticketId: ticket.id, limit: 100 });
    expect(page).toHaveLength(3);
    const one = await svc.listTicketEvents({ userId: USER, ticketId: ticket.id, limit: 1 });
    expect(one).toHaveLength(1);
    expect(one[0]!.kind).toBe('opened');
  });

  it('router does not invent 100 when events omits limit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-support/src/router.ts'), 'utf8');
    const start = src.indexOf('events:');
    const end = src.indexOf('accountState:', start);
    const fn = src.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain('limit: input.limit');
    expect(fn).not.toMatch(/input\.limit \?\? 100/);
    expect(fn).not.toMatch(/\?\? 100/);
  });

  it('listTicketEvents no longer dumps store.listEvents(ticketId) without a page', () => {
    const src = readFileSync(join(ROOT, 'services/svc-support/src/support-service.ts'), 'utf8');
    const start = src.indexOf('async listTicketEvents(');
    const end = src.indexOf('async readAccountState(', start);
    const fn = src.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain('assertListEventsLimit');
    expect(fn).toContain('this.store.listEvents(input.ticketId, { limit })');
    expect(fn).not.toMatch(/this\.store\.listEvents\(input\.ticketId\)\s*;/);
    expect(fn).not.toMatch(/\?\? 100/);
  });
});
