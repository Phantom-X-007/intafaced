import { createHash } from 'node:crypto';
import { z } from 'zod';
import { marketStateSnapshotSchema, type MarketAction, type MarketStateSnapshot } from '@intafaced/exchange-contract';
import type { MarketActionDecision } from './market-lifecycle.js';

/**
 * Additive svc-trade → svc-matching evidence.  The lifecycle snapshot remains
 * the exchange-contract authority; this type only binds the exact decision
 * made for this command to the snapshot that produced it.
 */
export const lifecycleAdmissionProofSchema = z
  .object({
    action: z.enum(['PLACE', 'PLACE_POST_ONLY']),
    decision: z.literal('ELIGIBLE'),
    checkedAt: z.string().datetime({ offset: true }),
    snapshotId: z.string().regex(/^trade\.lifecycle\.snapshot:[a-f0-9]{64}$/),
    transitionId: z.string().min(1),
    evidenceRefs: z.array(z.string().min(1)),
    snapshot: marketStateSnapshotSchema,
  })
  .superRefine((proof, context) => {
    if (!proof.snapshot.allowedActions.includes(proof.action)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['action'], message: 'action must be allowed by the exact snapshot' });
    }
    if (proof.checkedAt !== proof.snapshot.observedAt) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['checkedAt'], message: 'checkedAt must bind to snapshot observedAt' });
    }
    if (proof.transitionId !== proof.snapshot.transitionId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['transitionId'], message: 'transitionId must match snapshot' });
    }
    if (JSON.stringify(proof.evidenceRefs) !== JSON.stringify(proof.snapshot.evidenceRefs)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['evidenceRefs'], message: 'evidenceRefs must match snapshot' });
    }
    if (snapshotIdFor(proof.snapshot) !== proof.snapshotId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['snapshotId'], message: 'snapshotId must hash the exact snapshot' });
    }
  });

export type LifecycleAdmissionProof = z.infer<typeof lifecycleAdmissionProofSchema>;

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

export function snapshotIdFor(snapshot: MarketStateSnapshot): string {
  const parsed = marketStateSnapshotSchema.parse(snapshot);
  return `trade.lifecycle.snapshot:${createHash('sha256').update(JSON.stringify(parsed)).digest('hex')}`;
}

/** Construct and validate the immutable proof at the admission boundary. */
export function createLifecycleAdmissionProof(
  snapshot: MarketStateSnapshot,
  decision: MarketActionDecision,
  action: MarketAction,
): LifecycleAdmissionProof {
  const parsedSnapshot = marketStateSnapshotSchema.parse(snapshot);
  if (
    decision.decision !== 'ELIGIBLE' ||
    decision.action !== action ||
    (decision.action !== 'PLACE' && decision.action !== 'PLACE_POST_ONLY')
  ) {
    throw new Error('lifecycle admission proof action/decision mismatch');
  }
  const proof = lifecycleAdmissionProofSchema.parse({
    action,
    decision: 'ELIGIBLE',
    checkedAt: decision.checkedAt,
    snapshotId: snapshotIdFor(parsedSnapshot),
    transitionId: parsedSnapshot.transitionId,
    evidenceRefs: [...parsedSnapshot.evidenceRefs],
    snapshot: parsedSnapshot,
  });
  return freezeDeep(proof);
}
