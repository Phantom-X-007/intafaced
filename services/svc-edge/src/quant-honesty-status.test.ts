import { describe, expect, it } from 'vitest';
import { QUANT_COMPOSITE_HONESTY_PATH } from './quant-composite-honesty-door.js';
import { QUANT_HONESTY_ASSESS_PATH } from './quant-honesty-door.js';
import { describeQuantHonestyDoorStatus } from './quant-honesty-status.js';
import { QUANT_SURFACE_RENDER_PATH } from './quant-surface-render-door.js';

describe('quant honesty door status (D36)', () => {
  it('describeQuantHonestyDoorStatus lists all mounted doors including composite', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.mountedOnControlPlane).toBe(true);
    expect(status.notProxiedToSvcQuant).toBe(true);
    expect(status.inventsReturns).toBe(false);
    expect(status.compositeHonestyWired).toBe(true);
    expect(status.doors.map((door) => door.path)).toEqual([
      QUANT_HONESTY_ASSESS_PATH,
      '/quant/honesty/assess-comparison-order',
      '/quant/honesty/performance-labels',
      QUANT_SURFACE_RENDER_PATH,
      QUANT_COMPOSITE_HONESTY_PATH,
    ]);
  });
});
