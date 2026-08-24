import { z } from 'zod';

/**
 * Shared evidence vocabulary for the professional-exchange deterministic spine.
 *
 * These schemas deliberately describe facts carried between services. They do
 * not create an order store, an authority service, a sequence writer, or a
 * second money book. The owning services remain the systems of record named by
 * PX-S01/PX-S02/PX-S03; this package only prevents their wire contracts from
 * agreeing by accident.
 */

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const UNSIGNED_INTEGER = /^(0|[1-9]\d*)$/;
const CANONICAL_DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d{0,17}[1-9])?$/;

/** Stable opaque identifier. Whitespace and control characters are refused. */
export const spineIdSchema = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (value) => value.trim() === value && !CONTROL_CHARACTER.test(value),
    'identifier must be trimmed and contain no control characters',
  );
export type SpineId = z.infer<typeof spineIdSchema>;

/** Immutable version identifier; deliberately not assumed to be numeric. */
export const spineVersionSchema = spineIdSchema;
export type SpineVersion = z.infer<typeof spineVersionSchema>;

/**
 * Canonical signed decimal string for value-bearing fields on the wire.
 *
 * Canonical means no exponent, leading zero, trailing fractional zero, or
 * negative zero. Arithmetic still belongs in scaled-bigint money code.
 */
export const canonicalDecimalStringSchema = z
  .string()
  .refine((value) => CANONICAL_DECIMAL.test(value) && value !== '-0', 'value must be a canonical decimal string with at most 18 places');
export type CanonicalDecimalString = z.infer<typeof canonicalDecimalStringSchema>;

/**
 * A sequence travels as a digit string so JSON cannot round it above 2^53.
 * `domain` states which single writer owns monotonicity.
 */
export const spineSequenceSchema = z.object({
  domain: spineIdSchema,
  value: z.string().regex(UNSIGNED_INTEGER, 'sequence must be a canonical unsigned integer string'),
});
export type SpineSequence = z.infer<typeof spineSequenceSchema>;

export const spineClockSchema = z.object({
  /** Source timestamp retained even after normalization; null only when the source supplied none. */
  sourceAt: z.string().datetime({ offset: true }).nullable(),
  receivedAt: z.string().datetime({ offset: true }),
  clockSource: spineIdSchema,
  /** Explicit timestamp precision, never inferred from string length. */
  precision: z.enum(['seconds', 'milliseconds', 'microseconds', 'nanoseconds']),
});
export type SpineClock = z.infer<typeof spineClockSchema>;

export const authorityOriginSchema = z.enum(['HUMAN_SESSION', 'API_CREDENTIAL', 'SERVICE', 'OPERATOR']);

const authorityAttributionSchema = z.object({
  legalOwnerId: spineIdSchema,
  accountId: spineIdSchema,
  subAccountId: spineIdSchema,
  actorId: spineIdSchema,
  origin: authorityOriginSchema,
  sessionId: spineIdSchema.nullable(),
  credentialId: spineIdSchema.nullable(),
  grantId: spineIdSchema,
  grantVersion: spineVersionSchema,
  mandateId: spineIdSchema.nullable(),
  decidedAt: z.string().datetime({ offset: true }),
  freshnessAt: z.string().datetime({ offset: true }),
});

/** Effective authority is evidence, including refusal/staleness, never a boolean supplied by a caller. */
export const authorityEvidenceSchema = z
  .discriminatedUnion('decision', [
    authorityAttributionSchema.extend({ decision: z.literal('AUTHORIZED'), reasonCode: z.null() }),
    authorityAttributionSchema.extend({ decision: z.literal('REFUSED'), reasonCode: spineIdSchema }),
    authorityAttributionSchema.extend({ decision: z.literal('STALE'), reasonCode: spineIdSchema }),
    authorityAttributionSchema.extend({ decision: z.literal('UNAVAILABLE'), reasonCode: spineIdSchema }),
  ])
  .superRefine((evidence, context) => {
    const sessionOrigin = evidence.origin === 'HUMAN_SESSION' || evidence.origin === 'OPERATOR';
    if (sessionOrigin && evidence.sessionId === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['sessionId'], message: `${evidence.origin} requires session attribution` });
    }
    const credentialOrigin = evidence.origin === 'API_CREDENTIAL' || evidence.origin === 'SERVICE';
    if (credentialOrigin && evidence.credentialId === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['credentialId'],
        message: `${evidence.origin} requires credential attribution`,
      });
    }
  });
export type AuthorityEvidence = z.infer<typeof authorityEvidenceSchema>;

export const executionProvenanceSchema = z.enum(['NATIVE', 'VENUE_NATIVE', 'PLATFORM_SYNTHETIC', 'CLIENT_SYNTHETIC']);

export const executionCommandStateSchema = z.enum([
  'RECEIVED',
  'AUTHORIZED',
  'RISK_APPROVED',
  'INTENT_DURABLE',
  'HOLD_CONFIRMED',
  'ENGINE_SUBMITTING',
  'ENGINE_ACCEPTED',
  'ENGINE_REJECTED',
  'SUBMIT_UNKNOWN',
  'COMMAND_ACCEPTED',
  'APPLIED',
  'REFUSED',
  'OUTCOME_UNKNOWN',
  'RECONCILING',
]);
export type ExecutionCommandState = z.infer<typeof executionCommandStateSchema>;

export const orderLifecycleStateSchema = z.enum([
  'DRAFT',
  'PENDING_AUTHORITY',
  'PENDING_RISK',
  'PENDING_HOLD',
  'SUBMITTING',
  'OPEN',
  'PARTIALLY_FILLED',
  'AMEND_PENDING',
  'CANCEL_PENDING',
  'CANCELLED',
  'EXPIRED',
  'REJECTED',
  'FILLED_PENDING_SETTLEMENT',
  'FILLED_FINAL',
  'SUSPENDED',
  'RECOVERY_REQUIRED',
  'CORRECTION_PENDING',
  'CORRECTED',
  'BUSTED',
  'REINSTATED',
]);
export type OrderLifecycleState = z.infer<typeof orderLifecycleStateSchema>;

/** IDs and immutable versions needed to reconstruct one order command causally. */
export const executionCommandEnvelopeSchema = z.object({
  commandId: spineIdSchema,
  idempotencyKey: spineIdSchema,
  idempotencyScope: spineIdSchema,
  orderId: spineIdSchema,
  clientOrderId: spineIdSchema,
  instructionVersion: spineVersionSchema,
  expectedInstructionVersion: spineVersionSchema,
  parentOrderId: spineIdSchema.nullable(),
  childOrderId: spineIdSchema.nullable(),
  ruleVersion: spineVersionSchema,
  instrumentId: spineIdSchema,
  instrumentVersion: spineVersionSchema,
  marketId: spineIdSchema,
  environment: spineIdSchema,
  plane: z.enum(['FIAT', 'PROTOCOL']),
  provenance: executionProvenanceSchema,
  causalPredecessorId: spineIdSchema.nullable(),
  authority: authorityEvidenceSchema,
  clock: spineClockSchema,
  sequence: spineSequenceSchema.nullable(),
});
export type ExecutionCommandEnvelope = z.infer<typeof executionCommandEnvelopeSchema>;

const outcomeBaseSchema = z.object({
  commandId: spineIdSchema,
  state: executionCommandStateSchema,
  observedAt: z.string().datetime({ offset: true }),
});

/**
 * Acknowledgement, refusal, and unknown outcome are intentionally disjoint.
 * Unknown requires a durable reconciliation key and cannot masquerade as a
 * rejection that invites a risk-increasing retry.
 */
export const executionCommandOutcomeSchema = z.discriminatedUnion('outcome', [
  outcomeBaseSchema.extend({
    outcome: z.literal('APPLIED'),
    state: z.literal('APPLIED'),
    reasonCode: z.null(),
    reconciliationKey: z.null(),
  }),
  outcomeBaseSchema.extend({
    outcome: z.literal('REFUSED'),
    state: z.union([z.literal('ENGINE_REJECTED'), z.literal('REFUSED')]),
    reasonCode: spineIdSchema,
    reconciliationKey: z.null(),
  }),
  outcomeBaseSchema.extend({
    outcome: z.literal('OUTCOME_UNKNOWN'),
    state: z.union([z.literal('SUBMIT_UNKNOWN'), z.literal('OUTCOME_UNKNOWN'), z.literal('RECONCILING')]),
    reasonCode: spineIdSchema,
    reconciliationKey: spineIdSchema,
  }),
]);
export type ExecutionCommandOutcome = z.infer<typeof executionCommandOutcomeSchema>;

/** Corrections append causal evidence; an original record is never edited in place. */
export const correctionLinkSchema = z.discriminatedUnion('valueImpact', [
  z.object({
    correctionId: spineIdSchema,
    originalRecordId: spineIdSchema,
    causalPredecessorId: spineIdSchema,
    reasonCode: spineIdSchema,
    authorityRef: spineIdSchema,
    correctedAt: z.string().datetime({ offset: true }),
    valueImpact: z.literal('NONE'),
    ledgerTransactionId: z.null(),
  }),
  z.object({
    correctionId: spineIdSchema,
    originalRecordId: spineIdSchema,
    causalPredecessorId: spineIdSchema,
    reasonCode: spineIdSchema,
    authorityRef: spineIdSchema,
    correctedAt: z.string().datetime({ offset: true }),
    valueImpact: z.literal('LEDGER_POSTED'),
    ledgerTransactionId: spineIdSchema,
  }),
]);
export type CorrectionLink = z.infer<typeof correctionLinkSchema>;
