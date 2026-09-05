/**
 * Owner-published consecutive lag ticks above high-water before disconnect.
 * Blank / non-integer / below 1 refuses. Never invent 20.
 */
export const WS_MAX_LAG_TICKS_UNSET = 'ws.max_lag_ticks_unset' as const;

export function isPublishedMaxLagTicks(ticks: number | undefined): ticks is number {
  return typeof ticks === 'number' && Number.isInteger(ticks) && ticks >= 1;
}
