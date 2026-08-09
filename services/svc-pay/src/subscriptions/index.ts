/**
 * Subscriptions — schedule arithmetic + lifecycle (no charge runner yet).
 *
 * Crypto path is invoice-and-watch only (protocol forbids pull signatures).
 */
export {
  CADENCES,
  MAX_CATCH_UP_PER_PASS,
  occurrenceStart,
  dueOccurrence,
  lastOccurrenceBefore,
  planDue,
  type Cadence,
  type DuePlan,
} from './schedule.js';
export { SubscriptionService, assertMandateTermsUnchanged, type MandateRecord, type SubscriptionRecord } from './subscription-service.js';
