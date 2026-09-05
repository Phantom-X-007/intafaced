/**
 * Owner-published retry ceiling per channel. Blank / non-integer / out of
 * 1..5 refuses. Never invent 3.
 */
export const NOTIFY_MAX_DELIVERY_ATTEMPTS_UNSET = 'notify.max_delivery_attempts_unset' as const;

/** Owner `NOTIFY_MAX_DELIVERY_ATTEMPTS` unpublished. Blank env is not 3. */
export class NotifyMaxDeliveryAttemptsUnsetError extends Error {
  readonly code = NOTIFY_MAX_DELIVERY_ATTEMPTS_UNSET;
  constructor() {
    super('NOTIFY_MAX_DELIVERY_ATTEMPTS is unset. Blank refuses — never 3. Owner must set an integer 1..5 (3 is allowed if explicit).');
    this.name = 'NotifyMaxDeliveryAttemptsUnsetError';
  }
}

/** Blank / non-integer / out of 1..5 refuses. Never invent 3. */
export function publishedMaxDeliveryAttempts(attempts: number | null | undefined): number {
  if (attempts == null || !Number.isInteger(attempts) || attempts < 1 || attempts > 5) {
    throw new NotifyMaxDeliveryAttemptsUnsetError();
  }
  return attempts;
}
