import { z } from 'zod';
import { router, scopedProcedure, TRPCError } from '@intafaced/contracts';
import type { Sql } from 'postgres';
import { addOrgMember, assertOrgActor, assertOrgPlace, assertOrgRisk, createOrg, grantOrgRole, OrgError } from './orgs/org-service.js';
import {
  createDmaHierarchyProduct,
  DmaHierarchyRefuseError,
  UNPUBLISHED_DMA_HIERARCHY_LAW,
  type DmaHierarchyLaw,
} from './orgs/dma-hierarchy.js';

const orgRoleSchema = z.enum(['admin', 'trader', 'auditor', 'risk-manager']);
const dmaProductSchema = z.enum(['dma-broker', 'desk', 'shift']);

function toOrgTrpc(err: unknown): never {
  if (err instanceof DmaHierarchyRefuseError) {
    if (err.code === 'identity.dma.kind_required' || err.code === 'identity.dma.kind_invalid' || err.code === 'identity.dma.law_invalid') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
    }
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `${err.message} [${err.residual}]`,
      cause: err,
    });
  }
  if (err instanceof OrgError) {
    if (err.code === 'org.not_found' || err.code === 'org.member_not_found' || err.code === 'org.actor_not_found') {
      throw new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
    }
    if (
      err.code === 'org.membership_denied' ||
      err.code === 'org.not_admin' ||
      err.code === 'org.place_denied' ||
      err.code === 'org.risk_denied' ||
      err.code === 'org.second_approver_required' ||
      err.code === 'org.self_approval' ||
      err.code === 'org.second_approver_not_admin'
    ) {
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
 * Auditor and risk-manager cannot place. Trader and risk-manager cannot add members.
 * Admin grant refuses without a second distinct admin approver.
 * DMA broker / desk / shift create refuses until owner hierarchy law exists.
 */
export function createOrgRouter(sql: Sql, dmaHierarchyLaw: DmaHierarchyLaw = UNPUBLISHED_DMA_HIERARCHY_LAW) {
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
      .input(
        z.object({
          orgId: z.string().uuid(),
          memberId: z.string().uuid(),
          role: orgRoleSchema,
          secondApproverId: z.string().uuid().optional(),
        }),
      )
      .output(
        z.object({
          orgId: z.string().uuid(),
          userId: z.string().uuid(),
          role: orgRoleSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await addOrgMember(sql, ctx.principal.userId, input.orgId, input.memberId, input.role, input.secondApproverId);
        } catch (err) {
          toOrgTrpc(err);
        }
      }),
    grantOrgRole: scopedProcedure('identity:write')
      .input(
        z.object({
          orgId: z.string().uuid(),
          memberId: z.string().uuid(),
          role: orgRoleSchema,
          secondApproverId: z.string().uuid().optional(),
        }),
      )
      .output(
        z.object({
          orgId: z.string().uuid(),
          userId: z.string().uuid(),
          role: orgRoleSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await grantOrgRole(sql, ctx.principal.userId, input.orgId, input.memberId, input.role, input.secondApproverId);
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
    assertOrgRisk: scopedProcedure('identity:write')
      .input(z.object({ orgId: z.string().uuid() }))
      .output(
        z.object({
          orgId: z.string().uuid(),
          userId: z.string().uuid(),
          role: z.enum(['admin', 'risk-manager']),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await assertOrgRisk(sql, ctx.principal.userId, input.orgId);
        } catch (err) {
          toOrgTrpc(err);
        }
      }),
    /**
     * Named DMA product on an existing org. Unpublished owner law refuses.
     * Never persists a broker tree.
     */
    createDmaHierarchyProduct: scopedProcedure('identity:write')
      .input(z.object({ orgId: z.string().uuid(), kind: dmaProductSchema }))
      .output(z.object({ orgId: z.string().uuid(), kind: dmaProductSchema }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await createDmaHierarchyProduct({
            sql,
            actorUserId: ctx.principal.userId,
            orgId: input.orgId,
            kind: input.kind,
            law: dmaHierarchyLaw,
          });
        } catch (err) {
          toOrgTrpc(err);
        }
      }),
  });
}
