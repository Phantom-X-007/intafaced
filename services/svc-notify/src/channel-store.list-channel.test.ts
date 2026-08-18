/**
 * Channel-target store list — channel exact-match is part of the query, not a
 * post-filter of a mixed page. Memory and SQL share the same contract.
 * verified() / unverifiedChannels() still call unfiltered list(userId).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryTargetStore } from './channel-store.js';
import type { OutOfAppChannel } from './channels/channel.js';

const here = dirname(fileURLToPath(import.meta.url));

async function seed(store: MemoryTargetStore, userId: string, channel: OutOfAppChannel, address: string): Promise<void> {
  await store.upsert({
    userId,
    channel,
    address,
    locale: 'en',
    verifyTokenHash: 's'.repeat(64),
    verifyExpiresAt: new Date(Date.now() + 60_000),
  });
}

describe('MemoryTargetStore.list — channel exact-match, self-only', () => {
  it('omitted channel returns every target owned by the caller', async () => {
    const store = new MemoryTargetStore();
    await seed(store, 'u1', 'email', 'a@example.com');
    await seed(store, 'u1', 'sms', '+447700900000');
    await seed(store, 'u2', 'email', 'b@example.com');

    const items = await store.list('u1');
    expect(items.map((r) => r.channel).sort()).toEqual(['email', 'sms']);
    expect(items.every((r) => r.userId === 'u1')).toBe(true);
  });

  it('channel exact-matches in the same predicate as userId', async () => {
    const store = new MemoryTargetStore();
    await seed(store, 'u1', 'email', 'a@example.com');
    await seed(store, 'u1', 'sms', '+447700900000');
    await seed(store, 'u2', 'email', 'b@example.com');

    const items = await store.list('u1', 'email');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ userId: 'u1', channel: 'email', address: 'a@example.com' });
    expect(items.every((r) => r.userId === 'u1' && r.channel === 'email')).toBe(true);
  });

  it('unmatched channel is empty, never a synthetic row', async () => {
    const store = new MemoryTargetStore();
    await seed(store, 'u1', 'email', 'a@example.com');
    expect(await store.list('u1', 'push')).toEqual([]);
  });

  it('verified() and unverifiedChannels() still see every owned channel', async () => {
    const store = new MemoryTargetStore();
    await seed(store, 'u1', 'email', 'a@example.com');
    await seed(store, 'u1', 'sms', '+447700900000');
    expect(await store.markVerified('u1', 'email', 's'.repeat(64), new Date())).toBe(true);

    expect((await store.verified('u1')).map((t) => t.channel)).toEqual(['email']);
    expect(await store.unverifiedChannels('u1')).toEqual(['sms']);
  });
});

describe('PostgresTargetStore.list — channel is a SQL predicate', () => {
  it('filters with AND channel in the query, not after mapping a mixed page', () => {
    const src = readFileSync(join(here, 'channel-store.ts'), 'utf8');
    const pg = src.slice(src.indexOf('export class PostgresTargetStore'));
    const list = pg.slice(pg.indexOf('async list('), pg.indexOf('async verified('));
    expect(list).toMatch(/AND channel = \$\{channel\}/);
    expect(list).toMatch(/channelMatch/);
    expect(list).not.toMatch(/\.filter\(/);
  });
});

describe('MemoryTargetStore dispatcher lists stay unfiltered', () => {
  it('verified and unverifiedChannels call list(userId) with no channel', () => {
    const src = readFileSync(join(here, 'channel-store.ts'), 'utf8');
    const mem = src.slice(src.indexOf('export class MemoryTargetStore'), src.indexOf('export class PostgresTargetStore'));
    expect(mem).toMatch(/async verified\(userId: string\): Promise<ChannelTarget\[]> \{\s*return \(await this\.list\(userId\)\)/);
    expect(mem).toMatch(
      /async unverifiedChannels\(userId: string\): Promise<readonly ChannelId\[]> \{\s*return \(await this\.list\(userId\)\)/,
    );
  });
});
