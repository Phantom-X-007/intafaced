import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { issueAccessToken, verifyAccessToken } from '@intafaced/auth';
import type { Context } from '@intafaced/contracts';
import { createOrgRouter } from './org-router.js';
import { addOrgMember, assertOrgActor, createOrg } from './orgs/org-service.js';

const authConfig = {
  secret: 'an-identity-org-router-test-secret-long-enough',
  issuer: 'intafaced',
  audience: 'intafaced.api',
  accessTtlSeconds: 900,
};

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const SESSION = '44444444-4444-4444-8444-444444444444';

async function ctx(userId: string, scopes: string[]): Promise<Context> {
  const { token } = await issueAccessToken(
    {
      userId,
      sessionId: SESSION,
      scopes,
      tier: 'none',
      mfa: true,
    },
    authConfig,
  );
  return {
    principal: await verifyAccessToken(token, authConfig),
    service: null,
    region: 'DE',
    requestId: 'req-org-1',
  };
}

type OrgRow = { id: string; name: string; created_by: string };
type MemberRow = { org_id: string; user_id: string; role: 'owner' | 'member' };

function store(users: string[], orgs: OrgRow[], members: MemberRow[]) {
  const fn = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').toLowerCase();
    if (text.includes('insert into organizations')) {
      const id = String(values[0]);
      const name = String(values[1]);
      const createdBy = String(values[2]);
      const row = { id, name, created_by: createdBy };
      orgs.push(row);
      return [row];
    }
    if (text.includes('insert into organization_members')) {
      members.push({
        org_id: String(values[0]),
        user_id: String(values[1]),
        role: values[2] as 'owner' | 'member',
      });
      return [];
    }
    if (text.includes('from organizations')) {
      const id = values[0];
      return orgs.filter((o) => o.id === id).map((o) => ({ id: o.id }));
    }
    if (text.includes('from organization_members') && text.includes('role')) {
      const orgId = values[0];
      const userId = values[1];
      return members.filter((m) => m.org_id === orgId && m.user_id === userId).map((m) => ({ role: m.role }));
    }
    if (text.includes('from organization_members')) {
      const orgId = values[0];
      const userId = values[1];
      return members.filter((m) => m.org_id === orgId && m.user_id === userId).map((m) => ({ user_id: m.user_id }));
    }
    if (text.includes('from users')) {
      const id = values[0];
      return users.filter((u) => u === id).map((u) => ({ id: u }));
    }
    throw new Error(`unexpected sql: ${text}`);
  };
  return fn as unknown as Parameters<typeof createOrg>[0];
}

const codeOf = (err: unknown) => (err as { code?: string }).code;

describe('org router', () => {
  it('create, add member, member of A cannot act as B; missing ids refuse', async () => {
    const sql = store(
      [A, B, C],
      [
        { id: ORG_A, name: 'A', created_by: A },
        { id: ORG_B, name: 'B', created_by: B },
      ],
      [
        { org_id: ORG_A, user_id: A, role: 'owner' },
        { org_id: ORG_B, user_id: B, role: 'owner' },
      ],
    );
    const r = createOrgRouter(sql);
    const ownerA = r.createCaller(await ctx(A, ['identity:write']));
    const memberC = r.createCaller(await ctx(C, ['identity:write']));
    const ownerB = r.createCaller(await ctx(B, ['identity:write']));

    const created = await ownerA.createOrg({ name: 'Desk C' });
    expect(created.createdBy).toBe(A);

    await expect(ownerA.addOrgMember({ orgId: ORG_A, memberId: C })).resolves.toEqual({
      orgId: ORG_A,
      userId: C,
      role: 'member',
    });

    await expect(memberC.assertOrgActor({ orgId: ORG_A })).resolves.toMatchObject({
      orgId: ORG_A,
      userId: C,
      role: 'member',
    });
    const cross = await memberC.assertOrgActor({ orgId: ORG_B }).catch((e: unknown) => e);
    expect(codeOf(cross)).toBe('FORBIDDEN');

    const steal = await ownerB.addOrgMember({ orgId: ORG_A, memberId: C }).catch((e: unknown) => e);
    expect(codeOf(steal)).toBe('FORBIDDEN');

    const missingOrg = await ownerA.addOrgMember({ orgId: '', memberId: C } as never).catch((e: unknown) => e);
    expect(codeOf(missingOrg)).toBe('BAD_REQUEST');
    const missingMember = await ownerA.addOrgMember({ orgId: ORG_A, memberId: '' } as never).catch((e: unknown) => e);
    expect(codeOf(missingMember)).toBe('BAD_REQUEST');
  });

  it('refuses identity:read on write doors', async () => {
    const sql = store([A], [], []);
    const api = createOrgRouter(sql).createCaller(await ctx(A, ['identity:read']));
    const err = await api.createOrg({ name: 'Desk' }).catch((e: unknown) => e);
    expect(codeOf(err)).toBe('FORBIDDEN');
  });
});

describe('org service helpers stay wired to the router store', () => {
  it('createOrg on the same fake sql as the router', async () => {
    const sql = store([A], [], []);
    const org = await createOrg(sql, A, 'Desk');
    await expect(assertOrgActor(sql, A, org.id)).resolves.toMatchObject({ role: 'owner' });
    await expect(addOrgMember(sql, A, org.id, B)).rejects.toMatchObject({ code: 'org.member_not_found' });
  });
});

describe('org door is mounted', () => {
  it('index.ts mergeRouters includes createOrgRouter', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.ts'), 'utf8');
    expect(src).toMatch(/createOrgRouter\(sql\)/);
  });
});
