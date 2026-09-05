/**
 * Owner-published outbound socket high-water (bytes already handed to the
 * kernel and not yet drained). Blank / non-integer / below 1 refuses.
 * Never invent 1048576.
 */
export const WS_HIGH_WATER_BYTES_UNSET = 'ws.high_water_bytes_unset' as const;

export function isPublishedHighWaterBytes(bytes: number | undefined): bytes is number {
  return typeof bytes === 'number' && Number.isInteger(bytes) && bytes >= 1;
}
