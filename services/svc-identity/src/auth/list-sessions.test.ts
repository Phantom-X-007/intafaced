import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { listSessions, requireListSessionsUserId } from './list-sessions.js';
import { panicRevoke } from './panic-revoke.js';

type SessionRow = {
  id: string;
  user_id: string;
  revoked: boolean;
  created_at: Date;
  refresh_hash: string;
};

function sessionStore(sessions: SessionRow[]) {
  let writes = 0;
  const fn = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').toLowerCase();
    if (text.includes('select') && text.includes('from sessions') && text.includes('created_at')) {
      const named = values[0];
      return sessions
        .filter((s) => s.user_id === named && s.revoked === false)
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .map((s) => ({ id: s.id, created_at: s.created_at, revoked: s.revoked }));
    }
    if (text.includes('select') && text.includes('from sessions')) {
      const named = values[0];
      return sessions.filter((s) => s.user_id === named && s.revoked === false).map((s) => ({ id: s.id }));
    }
    if (text.includes('update api_keys')) {
      writes += 1;
      return [];
    }
    if (text.includes('update sessions')) {
      writes += 1;
      const sessionId = values[0];
      const named = values[1];
      const out: Array<{ id: string }> = [];
      for (const s of sessions) {
        if (s.id === sessionId && s.user_id === named && s.revoked === false) {
          s.revoked = true;
          out.push({ id: s.id });
        }
      }
      return out;
    }
    throw new Error(`unexpected sql: ${text}`);
  };
  return Object.assign(fn, {
    get writes() {
      return writes;
    },
    sessions,
  }) as unknown as Parameters<typeof listSessions>[0] & { writes: number; sessions: SessionRow[] };
}

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SID_A1 = '11111111-1111-4111-8111-111111111111';
const SID_A2 = '22222222-2222-4222-8222-222222222222';
const SID_A_DEAD = '33333333-3333-4333-8333-333333333333';
const SID_B = '44444444-4444-4444-8444-444444444444';
const T1 = new Date('2026-01-01T00:00:00.000Z');
const T2 = new Date('2026-02-01T00:00:00.000Z');
const T3 = new Date('2026-03-01T00:00:00.000Z');

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'list-sessions.ts'), 'utf8');
const indexSrc = readFileSync(join(here, '../index.ts'), 'utf8');
const routerSrc = readFileSync(join(here, '../list-sessions-router.ts'), 'utf8');

describe('listSessions', () => {
  it('refuses a missing userId and does not write', async () => {
    const sql = sessionStore([
      { id: SID_A1, user_id: A, revoked: false, created_at: T1, refresh_hash: 'secret-a' },
      { id: SID_B, user_id: B, revoked: false, created_at: T2, refresh_hash: 'secret-b' },
    ]);
    await expect(listSessions(sql, undefined)).rejects.toMatchObject({ code: 'auth.user_id_missing' });
    await expect(listSessions(sql, '')).rejects.toMatchObject({ code: 'auth.user_id_missing' });
    await expect(listSessions(sql, '   ')).rejects.toMatchObject({ code: 'auth.user_id_missing' });
    expect(() => requireListSessionsUserId(null)).toThrow(/userId is required/);
    expect(sql.writes).toBe(0);
  });

  it('lists live session ids/createdAt/revoked=false for that user only', async () => {
    const sql = sessionStore([
      { id: SID_A1, user_id: A, revoked: false, created_at: T1, refresh_hash: 'secret-a1' },
      { id: SID_A2, user_id: A, revoked: false, created_at: T2, refresh_hash: 'secret-a2' },
      { id: SID_A_DEAD, user_id: A, revoked: true, created_at: T3, refresh_hash: 'secret-dead' },
      { id: SID_B, user_id: B, revoked: false, created_at: T3, refresh_hash: 'secret-b' },
    ]);
    const out = await listSessions(sql, A);
    expect(out.userId).toBe(A);
    expect(out.sessions).toEqual([
      { id: SID_A2, createdAt: T2, revoked: false },
      { id: SID_A1, createdAt: T1, revoked: false },
    ]);
    expect(out.sessions.every((s) => s.revoked === false)).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/secret/);
    expect(JSON.stringify(out)).not.toMatch(/refresh/);
  });

  it('does not return a different user’s sessions', async () => {
    const sql = sessionStore([
      { id: SID_A1, user_id: A, revoked: false, created_at: T1, refresh_hash: 'secret-a' },
      { id: SID_B, user_id: B, revoked: false, created_at: T2, refresh_hash: 'secret-b' },
    ]);
    const out = await listSessions(sql, A);
    expect(out.sessions.map((s) => s.id)).toEqual([SID_A1]);
    expect(out.sessions.some((s) => s.id === SID_B)).toBe(false);
  });

  it('is empty after panic for that user; the other user stays live', async () => {
    const sql = sessionStore([
      { id: SID_A1, user_id: A, revoked: false, created_at: T1, refresh_hash: 'secret-a' },
      { id: SID_B, user_id: B, revoked: false, created_at: T2, refresh_hash: 'secret-b' },
    ]);
    const before = await listSessions(sql, A);
    expect(before.sessions).toHaveLength(1);
    await panicRevoke(sql, A, A);
    const after = await listSessions(sql, A);
    expect(after.sessions).toEqual([]);
    const other = await listSessions(sql, B);
    expect(other.sessions).toEqual([{ id: SID_B, createdAt: T2, revoked: false }]);
  });

  it('never selects refresh_hash or other secrets', () => {
    expect(src).toMatch(/SELECT id, created_at, revoked/);
    expect(src).not.toMatch(/refresh_hash/);
    expect(src).not.toMatch(/device/);
    expect(routerSrc).not.toMatch(/refresh_hash/);
    expect(routerSrc).toMatch(/scopedProcedure\('identity:read'\)/);
    expect(routerSrc).toMatch(/userId: z\.string\(\)\.uuid\(\)/);
  });
});

describe('listSessions is mounted (not helper-only)', () => {
  it('mergeRouters includes createListSessionsRouter', () => {
    expect(indexSrc).toMatch(/createListSessionsRouter\(sql\)/);
    expect(indexSrc).toMatch(/from ['"]\.\/list-sessions-router\.js['"]/);
  });
});
