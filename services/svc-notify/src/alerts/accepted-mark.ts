/**
 * Accepted mark for v22.alerts — same honesty as trade's accepted-mark:
 * a price the platform cannot source is never treated as live.
 *
 * `MarkSource.kind` is wiring. `quote()` is weather. A dark source that still
 * answers `{ kind: 'ok' }` is an invented mid, and an absent quote is not zero.
 * Both refuse. The evaluator never sees the lie.
 */

import type { MarkQuote, MarkSource } from './types.js';

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
 * The mark evaluation is allowed to see.
 *
 * Dark wiring wins over a quote that claims to be ok. Absent / null quotes
 * refuse rather than becoming `'0'` or a leftover cache.
 */
export function acceptAlertMark(source: Pick<MarkSource, 'kind'>, quote: MarkQuote | null | undefined): MarkQuote {
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
  return quote;
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
    if (row.available) continue;
    const code = row.reason === 'channel.disabled' ? 'channel.disabled' : 'channel.not_configured';
    return { code, detail: `${row.channel}:${row.reason ?? 'channel.not_configured'}` };
  }
  return null;
}
