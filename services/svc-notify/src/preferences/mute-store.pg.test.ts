import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { assertTestDatabase, postgresAvailable } from '@intafaced/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PostgresMuteStore } from './mute-store.js';

/**
 * `PostgresMuteStore` against a real database.
 *
 * Mute prefs ship as durable SQL (#991) and production wires this store in
 * `index.ts`. Until this file, nothing executed the SQL — only the pure mute
 * helpers and a memory store were covered. A restart that silently unmuted was
 * the original lie; a store whose SQL never ran is the same class of risk.
 */

const URL = process.env.TEST_DATABASE_URL_NOTIFY ?? 'postgres://svc_notify:svc_notify@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));

const MIGRATIONS = [
  '0000_notify_init.sql',
  '0001_notify_channels.sql',
  '0002_notify_delivery_accepted.sql',
  '0003_notify_mute_prefs.sql',
  '0004_notify_delivery_claim_lease.sql',
].map((f) => readFileSync(join(here, '..', '..', 'drizzle', f), 'utf8'));

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const available = await postgresAvailable(URL);
const sql = available ? postgres(URL, { max: 2, onnotice: () => undefined }) : null;

if (available && sql) {
  await assertTestDatabase(sql, 'svc-notify mute-store.pg.test');
  for (const migration of MIGRATIONS) {
    await sql.unsafe(migration).catch(() => undefined);
  }
}

afterAll(async () => {
  await sql?.end({ timeout: 1 }).catch(() => undefined);
});

describe.skipIf(!available)('PostgresMuteStore — mute survives a process death', () => {
  const store = () => new PostgresMuteStore(sql!);

  beforeEach(async () => {
    await sql!`DELETE FROM notify.channel_mutes WHERE user_id IN (${USER}, ${OTHER})`;
  });

  it('a muted channel is still muted after a fresh store is constructed', async () => {
    const a = store();
    const afterMute = await a.setMuted(USER, 'email', true);
    expect(afterMute.muted.has('email')).toBe(true);
    expect(afterMute.muted.has('sms')).toBe(false);

    // New instance = process restart. Memory would lose this; SQL must not.
    const b = store();
    const reloaded = await b.get(USER);
    expect(reloaded.muted.has('email')).toBe(true);
    expect(reloaded.muted.has('push')).toBe(false);
  });

  it('unmute removes the row so a restart does not re-mute', async () => {
    const a = store();
    await a.setMuted(USER, 'sms', true);
    await a.setMuted(USER, 'sms', false);

    const b = store();
    expect((await b.get(USER)).muted.has('sms')).toBe(false);
  });

  it('one user cannot mute another', async () => {
    const s = store();
    await s.setMuted(USER, 'push', true);
    expect((await s.get(OTHER)).muted.size).toBe(0);
    expect((await s.get(USER)).muted.has('push')).toBe(true);
  });
});
