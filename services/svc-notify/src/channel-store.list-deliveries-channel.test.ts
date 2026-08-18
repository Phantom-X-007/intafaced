/**
 * Delivery leftover list — channel and status exact-match are part of the
 * query, not a post-filter of a mixed page. Memory and SQL share the same
 * contract. Unfiltered listForNotification still returns every leftover,
 * sorted channel ASC. There is no `delivered` stamp.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryDeliveryStore, type DeliveryStatus } from './channel-store.js';
import type { ChannelId } from './channels/channel.js';

const here = dirname(fileURLToPath(import.meta.url));
const NOTE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function seed(store: MemoryDeliveryStore, notificationId: string, channel: ChannelId): Promise<void> {
  await store.claim(notificationId, channel, 3);
}

async function seedAs(
  store: MemoryDeliveryStore,
  notificationId: string,
  channel: ChannelId,
  status: Exclude<DeliveryStatus, 'pending' | 'abandoned'>,
): Promise<void> {
  const claim = await store.claim(notificationId, channel, 3);
  if (!claim.claimed) throw new Error('expected claim');
  await store.settle({
    id: claim.id,
    attempt: 1,
    status,
    attempted: status !== 'refused',
    refusalCode: status === 'refused' ? 'channel.not_configured' : undefined,
  });
}

describe('MemoryDeliveryStore.listForNotification — channel exact-match', () => {
  it('omitted channel returns every leftover for that notification, channel ASC', async () => {
    const store = new MemoryDeliveryStore();
    await seed(store, NOTE, 'sms');
    await seed(store, NOTE, 'inapp');
    await seed(store, NOTE, 'email');
    await seed(store, OTHER, 'email');

    const items = await store.listForNotification(NOTE);
    expect(items.map((r) => r.channel)).toEqual(['email', 'inapp', 'sms']);
    expect(items.every((r) => r.notificationId === NOTE)).toBe(true);
  });

  it('channel exact-matches in the same predicate as notificationId', async () => {
    const store = new MemoryDeliveryStore();
    await seed(store, NOTE, 'inapp');
    await seed(store, NOTE, 'email');
    await seed(store, NOTE, 'sms');
    await seed(store, OTHER, 'email');

    const items = await store.listForNotification(NOTE, 'email');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ notificationId: NOTE, channel: 'email' });
  });

  it('inapp is a valid leftover channel, unmatched is empty', async () => {
    const store = new MemoryDeliveryStore();
    await seed(store, NOTE, 'email');
    expect(await store.listForNotification(NOTE, 'inapp')).toEqual([]);
    await seed(store, NOTE, 'inapp');
    const inapp = await store.listForNotification(NOTE, 'inapp');
    expect(inapp).toHaveLength(1);
    expect(inapp[0]?.channel).toBe('inapp');
  });
});

describe('MemoryDeliveryStore.listForNotification — status exact-match AND channel', () => {
  it('omitted status returns mixed leftovers for that notification', async () => {
    const store = new MemoryDeliveryStore();
    await seedAs(store, NOTE, 'email', 'accepted');
    await seedAs(store, NOTE, 'sms', 'refused');
    await seedAs(store, NOTE, 'inapp', 'failed');
    await seedAs(store, OTHER, 'email', 'accepted');

    const items = await store.listForNotification(NOTE);
    expect(items.map((r) => r.channel)).toEqual(['email', 'inapp', 'sms']);
    expect(items.map((r) => r.status).sort()).toEqual(['accepted', 'failed', 'refused']);
  });

  it('status exact-matches in the same predicate as notificationId; miss is empty', async () => {
    const store = new MemoryDeliveryStore();
    await seedAs(store, NOTE, 'email', 'accepted');
    await seedAs(store, NOTE, 'sms', 'refused');

    const accepted = await store.listForNotification(NOTE, undefined, 'accepted');
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ notificationId: NOTE, status: 'accepted', channel: 'email' });
    expect(await store.listForNotification(NOTE, undefined, 'failed')).toEqual([]);
  });

  it('channel and status AND in the leftover predicate', async () => {
    const store = new MemoryDeliveryStore();
    await seedAs(store, NOTE, 'email', 'accepted');
    await seedAs(store, NOTE, 'sms', 'accepted');
    await seedAs(store, NOTE, 'inapp', 'refused');

    const and = await store.listForNotification(NOTE, 'email', 'accepted');
    expect(and).toHaveLength(1);
    expect(and[0]).toMatchObject({ notificationId: NOTE, channel: 'email', status: 'accepted' });
    expect(await store.listForNotification(NOTE, 'email', 'refused')).toEqual([]);
    expect(await store.listForNotification(NOTE, 'sms', 'refused')).toEqual([]);
  });
});

describe('PostgresDeliveryStore.listForNotification — channel and status are SQL predicates', () => {
  it('filters with AND channel in the query, not after mapping a mixed page', () => {
    const src = readFileSync(join(here, 'channel-store.ts'), 'utf8');
    const pg = src.slice(src.indexOf('export class PostgresDeliveryStore'));
    const list = pg.slice(pg.indexOf('async listForNotification('), pg.indexOf('async listRecent('));
    expect(list).toMatch(/AND channel = \$\{channel\}/);
    expect(list).toMatch(/channelMatch/);
    expect(list).toMatch(/AND status = \$\{status\}/);
    expect(list).toMatch(/statusMatch/);
    expect(list).not.toMatch(/\.filter\(/);
  });
});
