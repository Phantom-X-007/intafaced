/**
 * Queue priority is a score, not an SLA.
 *
 * DIRECTION §8 item 9: describing support timing to a user needs an owner
 * ruling. Emitting eta / dueAt / slaMinutes would invent that promise.
 */

export const QUEUE_TIMING_KIND = 'score_not_promise' as const;

export type QueueTimingHonesty = {
  readonly timingKind: typeof QUEUE_TIMING_KIND;
  readonly sla: false;
};

export function queueTimingHonesty(): QueueTimingHonesty {
  return { timingKind: QUEUE_TIMING_KIND, sla: false };
}

const PROMISE_KEYS = [
  'slaMinutes',
  'slaHours',
  'eta',
  'etaMs',
  'etaHours',
  'dueAt',
  'responseBy',
  'promiseHours',
  'guaranteeMinutes',
  'firstResponseSla',
] as const;

/**
 * True when a queue/ticket payload is dressed as a timed support promise.
 * `sla: false` is honesty, not a promise.
 */
export function looksLikeSlaPromise(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  const rec = value as Record<string, unknown>;
  if (rec.sla === true) return true;
  if (typeof rec.timingKind === 'string' && rec.timingKind !== QUEUE_TIMING_KIND) {
    if (/sla|promise|guarantee|eta/i.test(rec.timingKind)) return true;
  }
  for (const key of PROMISE_KEYS) {
    if (key in rec && rec[key] !== undefined && rec[key] !== false) return true;
  }
  return false;
}

export function assertScoreNotPromise(value: unknown): void {
  if (looksLikeSlaPromise(value)) {
    throw new Error('support queue must not describe timing as an SLA / promise');
  }
}
