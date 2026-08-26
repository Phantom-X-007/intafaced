import { describe, expect, it } from 'vitest';
import { addOrgMember, assertOrgActor, createOrg, requireMemberId, requireOrgId } from './org-service.js';

type OrgRow = { id: string; name: string; created_by: string };
type MemberRow = { org_id: string; user_id: string; role: 'owner' | 'member' };

function store(users: string[], orgs: OrgRow[], members: MemberRow[]) {
  let writes = 0;
  const fn = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').toLowerCase();
    if (text.includes('insert into organizations')) {
      writes += 1;
      const id = String(values[0]);
      const name = String(values[1]);
      const createdBy = String(values[2]);
      const row = { id, name, created_by: createdBy };
      orgs.push(row);
      return [row];
    }
    if (text.includes('insert into organization_members')) {
      writes += 1;
      members.push({
        org_id: String(values[0]),
        user_id: String(values[1]),
        role: values[2] as 'owner' | 'member',
      });
      return [];
    }
    if (text.includes('from organizations')) {
      const id = values[0];
      return orgs.filter((o) => o.id === id).map((o) => ({ id: o.id, name: o.name, created_by: o.created_by }));
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
  return Object.assign(fn, {
    get writes() {
      return writes;
    },
    orgs,
    members,
  }) as unknown as Parameters<typeof createOrg>[0] & { writes: number; orgs: OrgRow[]; members: MemberRow[] };
}

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';

describe('createOrg', () => {
  it('creates an org and seats the actor as owner', async () => {
    const sql = store([A], [], []);
    const out = await createOrg(sql, A, ' Desk Alpha ');
    expect(out.name).toBe('Desk Alpha');
    expect(out.createdBy).toBe(A);
    expect(sql.members).toEqual([{ org_id: out.id, user_id: A, role: 'owner' }]);
  });

  it('refuses a missing actor and does not write', async () => {
    const sql = store([A], [], []);
    await expect(createOrg(sql, undefined, 'Desk')).rejects.toMatchObject({ code: 'org.actor_id_required' });
    await expect(createOrg(sql, '   ', 'Desk')).rejects.toMatchObject({ code: 'org.actor_id_required' });
    expect(sql.writes).toBe(0);
  });
});

describe('addOrgMember', () => {
  it('lets an owner add a member', async () => {
    const sql = store([A, C], [{ id: ORG_A, name: 'A', created_by: A }], [{ org_id: ORG_A, user_id: A, role: 'owner' }]);
    await expect(addOrgMember(sql, A, ORG_A, C)).resolves.toEqual({
      orgId: ORG_A,
      userId: C,
      role: 'member',
    });
    expect(sql.members.some((m) => m.user_id === C && m.org_id === ORG_A && m.role === 'member')).toBe(true);
  });

  it('refuses missing orgId or memberId and does not write', async () => {
    const sql = store([A, C], [{ id: ORG_A, name: 'A', created_by: A }], [{ org_id: ORG_A, user_id: A, role: 'owner' }]);
    await expect(addOrgMember(sql, A, undefined, C)).rejects.toMatchObject({ code: 'org.id_required' });
    await expect(addOrgMember(sql, A, '', C)).rejects.toMatchObject({ code: 'org.id_required' });
    await expect(addOrgMember(sql, A, ORG_A, undefined)).rejects.toMatchObject({ code: 'org.member_id_required' });
    await expect(addOrgMember(sql, A, ORG_A, '  ')).rejects.toMatchObject({ code: 'org.member_id_required' });
    expect(() => requireOrgId(null)).toThrow(/orgId is required/);
    expect(() => requireMemberId(null)).toThrow(/memberId is required/);
    expect(sql.writes).toBe(0);
  });

  it('refuses a member of another org adding here', async () => {
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
    await expect(addOrgMember(sql, B, ORG_A, C)).rejects.toMatchObject({ code: 'org.membership_denied' });
    expect(sql.writes).toBe(0);
    expect(sql.members.filter((m) => m.user_id === C)).toHaveLength(0);
  });
});

describe('assertOrgActor', () => {
  it('a member of A cannot act as B', async () => {
    const sql = store(
      [A, B, C],
      [
        { id: ORG_A, name: 'A', created_by: A },
        { id: ORG_B, name: 'B', created_by: B },
      ],
      [
        { org_id: ORG_A, user_id: A, role: 'owner' },
        { org_id: ORG_A, user_id: C, role: 'member' },
        { org_id: ORG_B, user_id: B, role: 'owner' },
      ],
    );
    await expect(assertOrgActor(sql, C, ORG_A)).resolves.toEqual({ orgId: ORG_A, userId: C, role: 'member' });
    await expect(assertOrgActor(sql, C, ORG_B)).rejects.toMatchObject({ code: 'org.membership_denied' });
    await expect(assertOrgActor(sql, C, undefined)).rejects.toMatchObject({ code: 'org.id_required' });
  });
});
