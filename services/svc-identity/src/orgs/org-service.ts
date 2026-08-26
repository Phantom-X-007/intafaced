/**
 * Organizations + membership (M01).
 *
 * Create an org; add a member; a member of A cannot act as B.
 * Missing org/member id refuses — never invent a home org.
 * No balance. No ledger.
 */
import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';

export type OrgRole = 'owner' | 'member';

export type OrgView = {
  readonly id: string;
  readonly name: string;
  readonly createdBy: string;
};

export type OrgMemberView = {
  readonly orgId: string;
  readonly userId: string;
  readonly role: 'member';
};

export type OrgActorView = {
  readonly orgId: string;
  readonly userId: string;
  readonly role: OrgRole;
};

export class OrgError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'org.id_required'
      | 'org.member_id_required'
      | 'org.actor_id_required'
      | 'org.not_found'
      | 'org.member_not_found'
      | 'org.actor_not_found'
      | 'org.membership_denied'
      | 'org.not_owner'
      | 'org.already_member'
      | 'org.invalid',
  ) {
    super(message);
    this.name = 'OrgError';
  }
}

export function requireOrgId(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    throw new OrgError('orgId is required', 'org.id_required');
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new OrgError('orgId is required', 'org.id_required');
  }
  return value.trim();
}

export function requireMemberId(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    throw new OrgError('memberId is required', 'org.member_id_required');
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new OrgError('memberId is required', 'org.member_id_required');
  }
  return value.trim();
}

export function requireActorId(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    throw new OrgError('actor userId is required', 'org.actor_id_required');
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new OrgError('actor userId is required', 'org.actor_id_required');
  }
  return value.trim();
}

function requireName(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    throw new OrgError('org name is required', 'org.invalid');
  }
  const name = value.trim();
  if (name.length < 1 || name.length > 128) {
    throw new OrgError('org name is required', 'org.invalid');
  }
  return name;
}

type OrgRow = { id: string; name: string; created_by: string };
type MemberRow = { org_id: string; user_id: string; role: OrgRole };

export async function createOrg(sql: Sql, actorUserId: string | null | undefined, name: string | null | undefined): Promise<OrgView> {
  const actor = requireActorId(actorUserId);
  const orgName = requireName(name);
  const users = await sql<Array<{ id: string }>>`
    SELECT id FROM users WHERE id = ${actor} LIMIT 1
  `;
  if (!users[0]) {
    throw new OrgError('User not found', 'org.actor_not_found');
  }
  const id = randomUUID();
  const rows = await sql<OrgRow[]>`
    INSERT INTO organizations (id, name, created_by)
    VALUES (${id}, ${orgName}, ${actor})
    RETURNING id, name, created_by
  `;
  const row = rows[0];
  if (!row) {
    throw new OrgError('User not found', 'org.actor_not_found');
  }
  await sql`
    INSERT INTO organization_members (org_id, user_id, role)
    VALUES (${row.id}, ${actor}, ${'owner'})
  `;
  return { id: row.id, name: row.name, createdBy: row.created_by };
}

export async function addOrgMember(
  sql: Sql,
  actorUserId: string | null | undefined,
  orgId: string | null | undefined,
  memberId: string | null | undefined,
): Promise<OrgMemberView> {
  const actor = requireActorId(actorUserId);
  const org = requireOrgId(orgId);
  const member = requireMemberId(memberId);

  const orgs = await sql<Array<{ id: string }>>`
    SELECT id FROM organizations WHERE id = ${org} LIMIT 1
  `;
  if (!orgs[0]) {
    throw new OrgError('Organization not found', 'org.not_found');
  }

  const seat = await sql<Array<{ role: OrgRole }>>`
    SELECT role FROM organization_members WHERE org_id = ${org} AND user_id = ${actor} LIMIT 1
  `;
  if (!seat[0]) {
    throw new OrgError('Not a member of this organization', 'org.membership_denied');
  }
  if (seat[0].role !== 'owner') {
    throw new OrgError('Only an owner can add a member', 'org.not_owner');
  }

  const users = await sql<Array<{ id: string }>>`
    SELECT id FROM users WHERE id = ${member} LIMIT 1
  `;
  if (!users[0]) {
    throw new OrgError('Member not found', 'org.member_not_found');
  }

  const existing = await sql<Array<{ user_id: string }>>`
    SELECT user_id FROM organization_members WHERE org_id = ${org} AND user_id = ${member} LIMIT 1
  `;
  if (existing[0]) {
    throw new OrgError('Already a member', 'org.already_member');
  }

  await sql`
    INSERT INTO organization_members (org_id, user_id, role)
    VALUES (${org}, ${member}, ${'member'})
  `;
  return { orgId: org, userId: member, role: 'member' as const };
}

/**
 * Named org action. Membership in another org is not a shortcut.
 */
export async function assertOrgActor(
  sql: Sql,
  actorUserId: string | null | undefined,
  orgId: string | null | undefined,
): Promise<OrgActorView> {
  const actor = requireActorId(actorUserId);
  const org = requireOrgId(orgId);

  const orgs = await sql<Array<{ id: string }>>`
    SELECT id FROM organizations WHERE id = ${org} LIMIT 1
  `;
  if (!orgs[0]) {
    throw new OrgError('Organization not found', 'org.not_found');
  }

  const seat = await sql<Array<{ role: OrgRole }>>`
    SELECT role FROM organization_members WHERE org_id = ${org} AND user_id = ${actor} LIMIT 1
  `;
  if (!seat[0]) {
    throw new OrgError('Not a member of this organization', 'org.membership_denied');
  }
  return { orgId: org, userId: actor, role: seat[0].role };
}
