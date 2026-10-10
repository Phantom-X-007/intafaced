import { z } from 'zod';
import type { Context } from './trpc.js';

const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const revision = z.number().int().positive();
const timestamp = z.string().datetime({ offset: true });
const count = z.number().int().safe().nonnegative();
export const crmErasureCodeSchema = z.enum([
  'ops.crm.notification_unconfigured',
  'ops.crm.notification_erasure_unknown',
  'ops.crm.notification_in_flight',
]);
export const crmErasurePreviewInputSchema = z.object({ canonicalContactId: id }).strict();
export const crmErasurePreviewSchema = z
  .object({
    canonicalContactId: id,
    canonicalRevision: revision,
    contacts: z
      .array(z.object({ contactId: id, revision }).strict())
      .min(1)
      .max(200),
    submissionIds: z.array(id).max(200),
    counts: z.object({ contacts: count, submissions: count, opportunities: count, tasks: count, messages: count }).strict(),
    snapshot: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const crmErasureBeginInputSchema = z
  .object({
    requestId: id,
    canonicalContactId: id,
    expectedCanonicalRevision: revision,
    snapshot: z.string().regex(/^[a-f0-9]{64}$/),
    confirmedEntireCluster: z.literal(true),
    reason: z.enum(['confirmed_privacy_request', 'approved_retention_policy']),
  })
  .strict();
export const crmErasureAdvanceInputSchema = z.object({ requestId: id, intentId: id, expectedRevision: revision }).strict();
export const crmErasureStatusInputSchema = z.union([z.object({ intentId: id }).strict(), z.object({ canonicalContactId: id }).strict()]);
export const crmErasureStatusSchema = z
  .object({
    intentId: id,
    canonicalContactId: id,
    revision,
    status: z.enum(['pending_notify', 'complete']),
    requestedBy: id,
    requestedAt: timestamp,
    completedAt: timestamp.nullable(),
    pendingSubmissionCount: count,
    code: crmErasureCodeSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === 'complete' && (value.completedAt === null || value.pendingSubmissionCount !== 0 || value.code !== null))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Completion requires all original notification erasure receipts' });
    if (value.status === 'pending_notify' && value.completedAt !== null)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pending erasure cannot claim completion' });
  });
export const crmRetentionStatusSchema = z
  .object({ status: z.literal('disabled'), reason: z.literal('published_policy_unconfigured') })
  .strict();

/** Private founder/MFA operations; no email lookup or public deletion authority. */
export interface CrmPrivacyContract {
  privacyPreview(context: Context, input: z.infer<typeof crmErasurePreviewInputSchema>): Promise<z.infer<typeof crmErasurePreviewSchema>>;
  privacyBegin(context: Context, input: z.infer<typeof crmErasureBeginInputSchema>): Promise<z.infer<typeof crmErasureStatusSchema>>;
  /** One bounded remote erasure per call. Identical retries drive the same durable intent and return its current status. */
  privacyAdvance(context: Context, input: z.infer<typeof crmErasureAdvanceInputSchema>): Promise<z.infer<typeof crmErasureStatusSchema>>;
  privacyStatus(context: Context, input: z.infer<typeof crmErasureStatusInputSchema>): Promise<z.infer<typeof crmErasureStatusSchema>>;
  privacyRetentionStatus(context: Context): Promise<z.infer<typeof crmRetentionStatusSchema>>;
}
