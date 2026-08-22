/**
 * Quant honesty door status for /admin/status (D36).
 *
 * Operators reading control-plane JSON must see mounted quant doors — including
 * the composite assess path — without inferring from package boards alone.
 */

import { QUANT_HONESTY_ASSESS_PATH, QUANT_HONESTY_COMPARISON_PATH, QUANT_HONESTY_LABELS_PATH } from './quant-honesty-door.js';
import { QUANT_COMPOSITE_HONESTY_PATH } from './quant-composite-honesty-door.js';
import { QUANT_SURFACE_RENDER_PATH } from './quant-surface-render-door.js';

export function describeQuantHonestyDoorStatus() {
  return {
    mountedOnControlPlane: true as const,
    notProxiedToSvcQuant: true as const,
    inventsReturns: false as const,
    compositeHonestyWired: true as const,
    doors: [
      { path: QUANT_HONESTY_ASSESS_PATH, method: 'POST' as const, package: '@intafaced/quant-honesty' },
      { path: QUANT_HONESTY_COMPARISON_PATH, method: 'POST' as const, package: '@intafaced/quant-honesty' },
      { path: QUANT_HONESTY_LABELS_PATH, method: 'GET' as const, package: '@intafaced/quant-honesty' },
      { path: QUANT_SURFACE_RENDER_PATH, method: 'POST' as const, package: '@intafaced/connect-data-lake' },
      { path: QUANT_COMPOSITE_HONESTY_PATH, method: 'POST' as const, package: 'composite' },
    ],
    statusLine:
      'Quant honesty doors on control plane — backtest/comparison/labels + surface render + composite assess; not proxied to svc-quant',
  };
}
