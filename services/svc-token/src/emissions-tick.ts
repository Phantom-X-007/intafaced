/**
 * Auto-tick interval — owner-present ms, never a git-default 1 day.
 *
 * `EMISSIONS_AUTO_TICK` default OFF does not excuse inventing
 * `EMISSIONS_TICK_MS`. Blank / missing / garbage is unset. When auto-tick
 * is on, unset refuses `token.emissions_tick_unset`. Explicit `86400000`
 * is owner-present.
 */
import { TokenError } from './token-service.js';

/**
 * Read owner tick ms. Missing / blank / non-integer / below 1000 is unset —
 * never coerced to 86400000.
 */
export function readEmissionsTickMs(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  if (!/^[0-9]+$/.test(trimmed)) return undefined;
  const ms = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(ms) || ms < 1_000) return undefined;
  return ms;
}

export function requireEmissionsTickMsForAutoTick(autoTick: true, raw: string | undefined): number;
export function requireEmissionsTickMsForAutoTick(autoTick: false, raw: string | undefined): number | undefined;
export function requireEmissionsTickMsForAutoTick(autoTick: boolean, raw: string | undefined): number | undefined;
export function requireEmissionsTickMsForAutoTick(autoTick: boolean, raw: string | undefined): number | undefined {
  const tickMs = readEmissionsTickMs(raw);
  if (!autoTick) return tickMs;
  if (tickMs === undefined) {
    throw new TokenError('EMISSIONS_TICK_MS is unset — refusing to invent a 1-day mint cadence', 'token.emissions_tick_unset');
  }
  return tickMs;
}
