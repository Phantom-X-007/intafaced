import { z } from 'zod';

/**
 * ACTION-BOUND APPROVAL (Astra stage A / PX-S02).
 *
 * A free-text second name (`confirmOperatorId` / `confirmActorId`) is
 * attribution at most. It never establishes that a second person approved.
 * Identity issues a durable approval; the target service consumes it.
 *
 * This package carries the wire contract only — no persistence, no amounts.
 */

export const ACTION_APPROVAL_NOT_AUTHORITY = 'action_approval.names_are_not_authority' as const;

export const actionApprovalStatusSchema = z.enum(['PENDING', 'APPROVED', 'CONSUMED', 'REJECTED', 'EXPIRED', 'REVOKED']);
export type ActionApprovalStatus = z.infer<typeof actionApprovalStatusSchema>;

export const actionApprovalSchema = z.object({
  approvalId: z.string().min(1).max(128),
  actionType: z.string().min(1).max(128),
  targetService: z.string().min(1).max(64),
  targetId: z.string().min(1).max(256),
  expectedVersion: z.string().min(1).max(128),
  payloadHash: z.string().min(1).max(128),
  requesterId: z.string().min(1).max(128),
  /** Null until a distinct authenticated person approves. Never a typed-in name. */
  approverId: z.string().min(1).max(128).nullable(),
  policyVersion: z.string().min(1).max(128),
  createdAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  status: actionApprovalStatusSchema,
  operationId: z.string().min(1).max(128),
});
export type ActionApproval = z.infer<typeof actionApprovalSchema>;

/** Propose: requester only. Approver is filled on a later authenticated approve. */
export const actionApprovalProposeInputSchema = z.object({
  actionType: z.string().min(1).max(128),
  targetService: z.string().min(1).max(64),
  targetId: z.string().min(1).max(256),
  expectedVersion: z.string().min(1).max(128),
  payloadHash: z.string().min(1).max(128),
  policyVersion: z.string().min(1).max(128),
});
export type ActionApprovalProposeInput = z.infer<typeof actionApprovalProposeInputSchema>;

export const actionApprovalApproveInputSchema = z
  .object({
    approvalId: z.string().min(1).max(128),
  })
  .strict();
export type ActionApprovalApproveInput = z.infer<typeof actionApprovalApproveInputSchema>;

export const actionApprovalConsumeInputSchema = z.object({
  approvalId: z.string().min(1).max(128),
  operationId: z.string().min(1).max(128),
  payloadHash: z.string().min(1).max(128),
  targetService: z.string().min(1).max(64),
  targetId: z.string().min(1).max(256),
  expectedVersion: z.string().min(1).max(128),
});
export type ActionApprovalConsumeInput = z.infer<typeof actionApprovalConsumeInputSchema>;

/**
 * Two distinct strings in one request are not two authenticated people.
 * Services must not treat this shape as stage-A approval.
 */
export function namesAreNotActionApproval(input: {
  readonly actorId?: string | null;
  readonly confirmOperatorId?: string | null;
  readonly confirmActorId?: string | null;
}): true {
  void input;
  return true;
}

export function isConsumableApproval(row: ActionApproval): boolean {
  return row.status === 'APPROVED' && row.approverId !== null && row.approverId !== row.requesterId;
}

export function approvalCannotExecute(row: ActionApproval): boolean {
  return !isConsumableApproval(row);
}
