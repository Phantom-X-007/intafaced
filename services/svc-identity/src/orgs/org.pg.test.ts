import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { createTestDb, postgresAvailable, rewriteSchemaSql, type TestDb } from '@intafaced/db';
import { AuthService } from '../auth/auth-service.js';
import { RankService } from '../rank/rank-service.js';
import { addOrgMember, assertOrgActor, createOrg } from './org-service.js';

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(here, '../../drizzle');
const migrations = readdirSync(drizzleDir)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzleDir, f), 'utf8'));

const tokenConfig = {
  secret: 'an-identity-org-pg-test-signing-secret-long-enough',
  issuer: 'intafaced',
  audience: 'intafaced.api',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 2_592_000,
};

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('orgs (Postgres unavailable)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDb = await createTestDb({
    service: 'identity',
    url: URL,
    migrations: migrations.map((body) => (schema: string) => rewriteSchemaSql(body, 'identity', schema)),
  });
  const bus = new MemoryEventBus('svc-identity');
  const rank = new RankService(db.sql, bus);
  const auth = new AuthService(db.sql, bus, rank, tokenConfig);
  await rank.seedTiers();

  let counter = 0;
  const unique = () => `o${process.pid}${++counter}`;
  const register = () => {
    const handle = unique();
    return auth.register({ handle, email: `${handle}@example.com`, password: 'correct horse battery staple', region: 'DE' });
  };

  beforeEach(async () => {
    bus.reset();
    await db.truncateAll();
    await rank.seedTiers();
  });

  afterAll(async () => {
    await db.drop();
  });

  describe('orgs against Postgres', () => {
    it('create, add member, member of A cannot act as B; missing ids refuse', async () => {
      const ownerA = await register();
      const ownerB = await register();
      const member = await register();

      const orgA = await createOrg(db.sql, ownerA.userId, 'Desk A');
      const orgB = await createOrg(db.sql, ownerB.userId, 'Desk B');
      await addOrgMember(db.sql, ownerA.userId, orgA.id, member.userId);

      await expect(assertOrgActor(db.sql, member.userId, orgA.id)).resolves.toMatchObject({
        orgId: orgA.id,
        userId: member.userId,
        role: 'member',
      });
      await expect(assertOrgActor(db.sql, member.userId, orgB.id)).rejects.toMatchObject({
        code: 'org.membership_denied',
      });
      await expect(addOrgMember(db.sql, ownerB.userId, orgA.id, member.userId)).rejects.toMatchObject({
        code: 'org.membership_denied',
      });
      await expect(addOrgMember(db.sql, ownerA.userId, undefined, member.userId)).rejects.toMatchObject({
        code: 'org.id_required',
      });
      await expect(addOrgMember(db.sql, ownerA.userId, orgA.id, undefined)).rejects.toMatchObject({
        code: 'org.member_id_required',
      });
    });
  });
}
