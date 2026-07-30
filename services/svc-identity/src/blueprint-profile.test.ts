import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { describe, expect, it, beforeEach, afterAll, beforeAll } from 'vitest';
import { MemoryEventBus, MemorySeenStore } from '@intafaced/events';
import { assertTestDatabase } from '@intafaced/db';
import { applyBlueprintCreated, applyBlueprintDeleted, readBlueprintId } from './blueprint-profile.js';
import { subscribeBlueprintProfileEvents } from './events.js';

/**
 * Blueprint cascade — svc-identity half of §7.2.
 *
 * Real Postgres. Proves:
 *   · created sets profiles.blueprint_id
 *   · deleted clears only when the id still matches
 *   · a newer blueprint survives a late/redelivered delete of the old one
 *   · bus wiring delivers into the same mutations (MemoryEventBus)
 */

const URL = process.env.TEST_DATABASE_URL_IDENTITY ?? 'postgres://svc_identity:svc_identity@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const migrations = ['0000_identity_init.sql', '0001_identity_kyc_review.sql', '0002_sub_accounts_revoke.sql'].map((f) =>
  readFileSync(join(here, '..', 'drizzle', f), 'utf8'),
);

const sql = postgres(URL, {
  max: 4,
  onnotice: () => undefined,
  connection: { search_path: 'identity,public', application_name: 'svc-identity-blueprint-test' },
});

let available = true;

try {
  await sql`SELECT 1`;
  await assertTestDatabase(sql, 'svc-identity blueprint cascade');
  for (const m of migrations) await sql.unsafe(m);
} catch {
  available = false;
}

const describeDb = available ? describe : describe.skip;

async function seedUser(userId: string) {
  await sql`
    INSERT INTO identity.users (id, handle, email, password_hash, status)
    VALUES (${userId}, ${`bp_${userId.slice(0, 8)}`}, ${`bp-${userId.slice(0, 8)}@test.local`}, 'x', 'active')
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`
    INSERT INTO identity.profiles (user_id, display_name, region)
    VALUES (${userId}, 'Cascade Test', 'global')
    ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name
  `;
  await sql`UPDATE identity.profiles SET blueprint_id = NULL WHERE user_id = ${userId}`;
}

describeDb('blueprint profile cascade (§7.2)', () => {
  beforeAll(() => {
    if (!available) return;
  });

  beforeEach(async () => {
    await sql`TRUNCATE identity.profiles, identity.users CASCADE`;
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it('sets blueprint_id on created', async () => {
    const userId = randomUUID();
    const blueprintId = randomUUID();
    await seedUser(userId);

    const r = await applyBlueprintCreated(sql, { userId, blueprintId });
    expect(r.updated).toBe(true);
    expect(await readBlueprintId(sql, userId)).toBe(blueprintId);
  });

  it('clears blueprint_id on deleted when it still matches', async () => {
    const userId = randomUUID();
    const blueprintId = randomUUID();
    await seedUser(userId);
    await applyBlueprintCreated(sql, { userId, blueprintId });

    const r = await applyBlueprintDeleted(sql, { userId, blueprintId });
    expect(r.cleared).toBe(true);
    expect(await readBlueprintId(sql, userId)).toBeNull();
  });

  it('does not clear a newer blueprint when an old delete is redelivered', async () => {
    const userId = randomUUID();
    const oldId = randomUUID();
    const newId = randomUUID();
    await seedUser(userId);
    await applyBlueprintCreated(sql, { userId, blueprintId: oldId });
    await applyBlueprintCreated(sql, { userId, blueprintId: newId });

    const r = await applyBlueprintDeleted(sql, { userId, blueprintId: oldId });
    expect(r.cleared).toBe(false);
    expect(await readBlueprintId(sql, userId)).toBe(newId);
  });

  it('is a no-op when already cleared (idempotent erase)', async () => {
    const userId = randomUUID();
    const blueprintId = randomUUID();
    await seedUser(userId);
    await applyBlueprintCreated(sql, { userId, blueprintId });
    await applyBlueprintDeleted(sql, { userId, blueprintId });

    const r = await applyBlueprintDeleted(sql, { userId, blueprintId });
    expect(r.cleared).toBe(false);
    expect(await readBlueprintId(sql, userId)).toBeNull();
  });

  it('bus subscribers apply create then delete end to end', async () => {
    const userId = randomUUID();
    const blueprintId = randomUUID();
    await seedUser(userId);

    const bus = new MemoryEventBus('svc-blueprint');
    const store = new MemorySeenStore();
    await subscribeBlueprintProfileEvents(bus, sql, store);

    await bus.publish(
      'blueprintCreated',
      {
        blueprintId,
        userId,
        engineVersion: 'test-1',
        visibility: 'private',
      },
      { idempotencyKey: `created:${blueprintId}` },
    );

    expect(await readBlueprintId(sql, userId)).toBe(blueprintId);

    await bus.publish(
      'blueprintDeleted',
      {
        blueprintId,
        userId,
        erasedAt: new Date().toISOString(),
      },
      { idempotencyKey: `deleted:${blueprintId}` },
    );

    expect(await readBlueprintId(sql, userId)).toBeNull();

    await bus.publish(
      'blueprintDeleted',
      {
        blueprintId,
        userId,
        erasedAt: new Date().toISOString(),
      },
      { idempotencyKey: `deleted:${blueprintId}:replay` },
    );
    expect(await readBlueprintId(sql, userId)).toBeNull();
  });
});
