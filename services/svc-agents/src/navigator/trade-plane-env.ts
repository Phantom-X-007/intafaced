/**
 * Navigator trade plane from deployment wiring.
 *
 * Callers may request `live`, but without TRADE_URL the fleet trade REST door
 * is dark — coerce to `dark` so grounded tools refuse `trade_plane_dark` rather
 * than accepting fixtures the platform cannot ground.
 */

import type { TradeDataPlane } from './grounded.js';

export function effectiveNavigatorTradePlane(requested: TradeDataPlane, tradeUrl: string | undefined): TradeDataPlane {
  if (requested === 'dark') return 'dark';
  if (!tradeUrl?.trim()) return 'dark';
  return 'live';
}
