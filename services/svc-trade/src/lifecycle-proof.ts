import {
  createMarketLifecycleAdmissionProof,
  marketLifecycleAdmissionProofSchema,
  snapshotIdFor,
  type MarketAction,
  type MarketLifecycleAdmissionProof,
  type MarketStateSnapshot,
} from '@intafaced/exchange-contract';
import type { MarketActionDecision } from './market-lifecycle.js';

/**
 * Compatibility names for the service boundary. The exchange contract owns
 * the schema, snapshot hash, property order, and immutable proof construction.
 */
export const lifecycleAdmissionProofSchema = marketLifecycleAdmissionProofSchema;
export type LifecycleAdmissionProof = MarketLifecycleAdmissionProof;
export { snapshotIdFor };

/**
 * Keep the pre-contract service signature while delegating every proof byte
 * and validation rule to the canonical exchange contract constructor.
 */
export function createLifecycleAdmissionProof(
  snapshot: MarketStateSnapshot,
  decision: MarketActionDecision,
  action: MarketAction,
): LifecycleAdmissionProof {
  if (decision.decision !== 'ELIGIBLE' || decision.action !== action) {
    throw new Error('lifecycle admission proof action/decision mismatch');
  }
  return createMarketLifecycleAdmissionProof(snapshot, action, decision.checkedAt);
}
