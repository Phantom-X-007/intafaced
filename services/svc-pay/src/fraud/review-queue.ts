/**
 * pay.fraud — manual review queue (SPEC-PAY-VERTICALS §3 · D26-P1-P5).
 *
 * Scoring returns `review`; this queue is where a human decision lands.
 * Moves no value. Never invents blocklist content or auto-resolves without
 * an explicit actor + outcome.
 */

import type { FraudDecision, FraudReason } from './evaluate.js';

export type FraudReviewStatus = 'open' | 'allowed' | 'declined';

export interface FraudReviewCase {
  readonly id: string;
  readonly merchantId: string;
  readonly paymentId: string | null;
  readonly amount: string;
  readonly assetId: string;
  readonly decision: FraudDecision;
  readonly status: FraudReviewStatus;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
  readonly resolvedBy: string | null;
  readonly resolutionNote: string | null;
}

export class FraudReviewError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'pay.fraud_review_not_review'
      | 'pay.fraud_review_not_found'
      | 'pay.fraud_review_closed'
      | 'pay.fraud_review_actor_required'
      | 'pay.fraud_review_list_limit_unset',
  ) {
    super(message);
    this.name = 'FraudReviewError';
  }
}

/** fraud.listOpenReviews page size unpublished. Blank / non-finite / <1 refuses. Never invent 50. */
export function assertFraudReviewListLimit(limit: number | undefined): number {
  if (limit === undefined || typeof limit !== 'number' || !Number.isFinite(limit)) {
    throw new FraudReviewError(
      'fraud.listOpenReviews page size is unset. Blank refuses — never 50. Pass a positive integer (50 is allowed if explicit).',
      'pay.fraud_review_list_limit_unset',
    );
  }
  const n = Math.floor(limit);
  if (n < 1) {
    throw new FraudReviewError(
      'fraud.listOpenReviews page size is unset. Blank refuses — never 50. Pass a positive integer (50 is allowed if explicit).',
      'pay.fraud_review_list_limit_unset',
    );
  }
  return Math.min(200, n);
}

export interface EnqueueFraudReviewInput {
  readonly id: string;
  readonly merchantId: string;
  readonly amount: string;
  readonly assetId: string;
  readonly decision: FraudDecision;
  readonly paymentId?: string | null;
  readonly now?: Date;
}

export interface ResolveFraudReviewInput {
  readonly id: string;
  readonly outcome: 'allow' | 'decline';
  readonly actorId: string;
  readonly note?: string | null;
  readonly now?: Date;
}

export interface FraudReviewQueue {
  enqueue(input: EnqueueFraudReviewInput): FraudReviewCase;
  get(id: string): FraudReviewCase | null;
  listOpen(merchantId?: string, limit?: number): readonly FraudReviewCase[];
  resolve(input: ResolveFraudReviewInput): FraudReviewCase;
}

/** Process-local queue — durable store is an ops residual, not invent here. */
export class MemoryFraudReviewQueue implements FraudReviewQueue {
  private readonly cases = new Map<string, FraudReviewCase>();

  enqueue(input: EnqueueFraudReviewInput): FraudReviewCase {
    if (input.decision.outcome !== 'review') {
      throw new FraudReviewError('Only evaluate outcomes of review may enter the fraud review queue', 'pay.fraud_review_not_review');
    }
    if (input.decision.reasons.length === 0) {
      throw new FraudReviewError('Review cases require explainable reasons (SPEC §3)', 'pay.fraud_review_not_review');
    }
    const existing = this.cases.get(input.id);
    if (existing) return existing;

    const createdAt = (input.now ?? new Date()).toISOString();
    const row: FraudReviewCase = {
      id: input.id,
      merchantId: input.merchantId,
      paymentId: input.paymentId ?? null,
      amount: input.amount,
      assetId: input.assetId,
      decision: Object.freeze({
        outcome: input.decision.outcome,
        reasons: Object.freeze([...input.decision.reasons]) as readonly FraudReason[],
        skippedDisabled: Object.freeze([...input.decision.skippedDisabled]),
      }),
      status: 'open',
      createdAt,
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
    };
    this.cases.set(row.id, row);
    return row;
  }

  get(id: string): FraudReviewCase | null {
    return this.cases.get(id) ?? null;
  }

  listOpen(merchantId?: string, limit?: number): readonly FraudReviewCase[] {
    const n = assertFraudReviewListLimit(limit);
    return [...this.cases.values()]
      .filter((c) => c.status === 'open' && (merchantId === undefined || c.merchantId === merchantId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, n);
  }

  resolve(input: ResolveFraudReviewInput): FraudReviewCase {
    const actor = input.actorId?.trim();
    if (!actor) {
      throw new FraudReviewError('actorId is required to resolve a fraud review', 'pay.fraud_review_actor_required');
    }
    const current = this.cases.get(input.id);
    if (!current) {
      throw new FraudReviewError(`No fraud review case ${input.id}`, 'pay.fraud_review_not_found');
    }
    if (current.status !== 'open') {
      throw new FraudReviewError(`Fraud review ${input.id} is already ${current.status}`, 'pay.fraud_review_closed');
    }
    const next: FraudReviewCase = {
      ...current,
      status: input.outcome === 'allow' ? 'allowed' : 'declined',
      resolvedAt: (input.now ?? new Date()).toISOString(),
      resolvedBy: actor,
      resolutionNote: input.note?.trim() ? input.note.trim() : null,
    };
    this.cases.set(next.id, next);
    return next;
  }
}

/** Process-local default — durable review store is an ops residual. */
export const defaultFraudReviewQueue = new MemoryFraudReviewQueue();
