/**
 * execution.spine product policy — OMS/SOR/arb/MM door catalog (D26-P1-X3–X5).
 */
import { describeExecutionSpine, EXECUTION_SPINE_DOORS } from './oms-spine.js';

export type ExecutionPolicySummary = ReturnType<typeof describeExecutionSpine>;

/** Public honesty board for execution spine — catalog only, no invented quotes. */
export function describeExecutionPolicy(): ExecutionPolicySummary {
  return describeExecutionSpine();
}

export { EXECUTION_SPINE_DOORS };
