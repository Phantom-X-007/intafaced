/**
 * Owner-published socket ceilings. Blank / non-integer / below 1 refuses.
 * Never invent 5000 or 16.
 */
export const WS_MAX_CONNECTIONS_UNSET = 'ws.max_connections_unset' as const;
export const WS_PRIVATE_MAX_CONNECTIONS_PER_USER_UNSET = 'ws.private_max_connections_per_user_unset' as const;

export function isPublishedConnectionCeiling(max: number | undefined): max is number {
  return typeof max === 'number' && Number.isInteger(max) && max >= 1;
}
