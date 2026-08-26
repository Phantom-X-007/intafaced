import { z } from 'zod';
import { router, scopedProcedure, TRPCError } from '@intafaced/contracts';
import type { Sql } from 'postgres';
import { addOrgMember, assertOrgActor, assertOrgPlace, createOrg, OrgError } from './orgs/org-service.js';

const orgRoleSchema = z.enum(['admin', 'trader', 'auditor']);

function toOrgTrpc(err: unknown): never {
  if (err instanceof OrgError) {
    if (err.code === 'org.not_found' || err.code === 'org.member_not_found' || err.code === 'org.actor_not_found') {
      throw new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
    }
    if (err.code === 'org.membership_denied' || err.code === 'org.not_admin' || err.code === 'org.place_denied') {
      throw new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
    }
    if (err.code === 'org.already_member') {
      throw new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
    }
    throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  throw err;
}

/**
 * Top-level org doors so mergeRouters cannot replace auth/subAccounts.
 * identity:write. Missing org/member/role refuses. Membership in A cannot act as B.
 * Auditor cannot place. Trader cannot add members.
 */
export function createOrgRouter(sql: Sql) {
  return router({
    createOrg: scopedProcedure('identity:write')
      .input(z.object({ name: z.string().min(1).max(128) }))
      .output(z.object({ id: z.string().uuid(), name: z.string(), createdBy: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await createOrg(sql, ctx.principal.userId, input.name);
        } catch (err) {
          toOrgTrpc(err);
        }
      }),
    addOrgMember: scopedProcedure('identity:write')
      .input(z.object({ orgId: z.string().uuid(), memberId: z.string().uuid(), role: orgRoleSchema }))
      .output(
        z.object({
          orgId: z.string().uuid(),
          userId: z.string().uuid(),
          role: orgRoleSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await addOrgMember(sql, ctx.principal.userId, input.orgId, input.memberId, input.role);
        } catch (err) {
          toOrgTrpc(err);
        }
      }),
    assertOrgActor: scopedProcedure('identity:write')
      .input(z.object({ orgId: z.string().uuid() }))
      .output(
        z.object({
          orgId: z.string().uuid(),
          userId: z.string().uuid(),
          role: orgRoleSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await assertOrgActor(sql, ctx.principal.userId, input.orgId);
        } catch (err) {
          toOrgTrpc(err);
        }
      }),
    assertOrgPlace: scopedProcedure('identity:write')
      .input(z.object({ orgId: z.string().uuid() }))
      .output(
        z.object({
          orgId: z.string().uuid(),
          userId: z.string().uuid(),
          role: z.enum(['admin', 'trader']),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await assertOrgPlace(sql, ctx.principal.userId, input.orgId);
        } catch (err) {
          toOrgTrpc(err);
        }
      }),
  });
}
