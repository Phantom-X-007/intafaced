/**
 * Accepted mark for v22.alerts — same honesty as trade's accepted-mark:
 * a price the platform cannot source is never treated as live.
 *
 * `MarkSource.kind` is wiring. `quote()` is weather. A dark source that still
 * answers `{ kind: 'ok' }` is an invented mid, and an absent quote is not zero.
 * Both refuse. The evaluator never sees the lie.
 *
 * Age is weather too. The trade ticker carries `timestamp` (ms). A live source
 * that returns `{ kind: 'ok' }` with a hours-old `at` is a stale print, not a
 * price — the same refuse bank already applies to this ticker
 * (`DEFAULT_MARK_POLICY.maxAgeSeconds = 300`). Firing a one-shot watch on it
 * would consume the alert against a memory.
 */

import type { MarkQuote, MarkSource } from './types.js';

/**
 * Same ticker bank marks loans against. Older than this is a memory, not a price.
 * Not an env var: a deployment must not silently lengthen "fresh" and start
 * firing watches on yesterday's last print.
 */
export const ALERT_MARK_MAX_AGE_MS = 300_000;

/**
 * Clock-skew slack. A mark dated further ahead than this is how a stale price
 * passes an age check (bank `acceptableForMarking`, −30s).
 */
export const ALERT_MARK_FUTURE_SLACK_MS = 30_000;

/** Channel status slice AlertService needs — structural so this file stays mark-shaped. */
export type AlertChannelStatusSlice = {
  readonly channel: string;
  readonly required: boolean;
  readonly available: boolean;
  readonly reason: string | null;
};

export type OutOfAppRequiredRefusal = {
  readonly code: 'channel.not_configured' | 'channel.disabled';
  readonly detail: string;
};

/**
 * Refuse an otherwise-ok quote whose `at` is too old or too far in the future.
 *
 * Unavailable quotes pass through — they already named why. Called from the
 * HTTP producer (so `quote()` itself is honest) and from `acceptAlertMark`
 * (so a memory live source cannot skip the age gate).
 */
export function refuseIfMarkAged(quote: MarkQuote, now: Date): MarkQuote {
  if (quote.kind !== 'ok') return quote;
  const ageMs = now.getTime() - quote.at.getTime();
  if (ageMs > ALERT_MARK_MAX_AGE_MS) {
    return {
      kind: 'unavailable',
      reason: 'stale',
      detail: `mark is ${Math.round(ageMs / 1_000)}s old, limit ${ALERT_MARK_MAX_AGE_MS / 1_000}s`,
    };
  }
  if (ageMs < -ALERT_MARK_FUTURE_SLACK_MS) {
    return {
      kind: 'unavailable',
      reason: 'refused',
      detail: `mark is dated ${Math.round(-ageMs / 1_000)}s in the future`,
    };
  }
  return quote;
}

/**
 * The mark evaluation is allowed to see.
 *
 * Dark wiring wins over a quote that claims to be ok. Absent / null quotes
 * refuse rather than becoming `'0'` or a leftover cache. A live ok quote whose
 * `at` is older than `ALERT_MARK_MAX_AGE_MS` (or dated in the future) refuses
 * as stale / refused — never fires.
 */
export function acceptAlertMark(source: Pick<MarkSource, 'kind'>, quote: MarkQuote | null | undefined, now: Date = new Date()): MarkQuote {
  if (source.kind === 'dark') {
    if (quote?.kind === 'unavailable') {
      return quote;
    }
    return {
      kind: 'unavailable',
      reason: 'dark',
      detail: 'mark source is dark — refuse rather than invent',
    };
  }
  if (quote == null) {
    return {
      kind: 'unavailable',
      reason: 'refused',
      detail: 'absent mark — refuse rather than invent',
    };
  }
  return refuseIfMarkAged(quote, now);
}

/**
 * An alert that must leave the app and cannot must refuse by name.
 *
 * `required: true` is the operator's NOTIFY_REQUIRED_CHANNELS declaration.
 * Inbox-only NotifyService returns no statuses — nothing was required, so this
 * returns null and in-app fire remains honest. Unconfigured / disabled required
 * channels never silently drop.
 */
export function outOfAppRequiredRefusal(statuses: readonly AlertChannelStatusSlice[]): OutOfAppRequiredRefusal | null {
  for (const row of statuses) {
    if (row.channel === 'inapp') continue;
    if (!row.required) continue;
    // URL+token is unprobed, not a refuse-to-fire: deliver() will POST.
    if (row.reason === 'channel.unprobed') continue;
    if (row.available) continue;
    const code = row.reason === 'channel.disabled' ? 'channel.disabled' : 'channel.not_configured';
    return { code, detail: `${row.channel}:${row.reason ?? 'channel.not_configured'}` };
  }
  return null;
}
