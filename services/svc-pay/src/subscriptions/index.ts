/**
 * Subscriptions — schedule + lifecycle + due runner (invoice path, no pull).
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
export {
  SubscriptionService,
  assertMandateTermsUnchanged,
  normaliseSubscriptionPath,
  SUBSCRIPTION_PATHS,
  type MandateRecord,
  type SubscriptionRecord,
  type SubscriptionInvoiceOpener,
  type SubscriptionPath,
  type FiringOutcome,
  type RunReport,
} from './subscription-service.js';
