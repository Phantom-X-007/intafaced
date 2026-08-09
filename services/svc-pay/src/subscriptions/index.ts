/**
 * Subscriptions — schedule arithmetic first.
 *
 * Crypto path is invoice-and-watch only (protocol forbids pull signatures).
 * Card path may later use RailAdapter mandate ops. Neither is implemented here.
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
