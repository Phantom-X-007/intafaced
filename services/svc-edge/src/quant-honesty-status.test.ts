import { describe, expect, it } from 'vitest';
import { EDGE_QUANT_COMPOSITE_HONESTY_DOOR, EDGE_QUANT_SURFACE_RENDER_DOOR } from '@intafaced/connect-data-lake';
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
      EDGE_QUANT_SURFACE_RENDER_DOOR,
      EDGE_QUANT_COMPOSITE_HONESTY_DOOR,
    ]);
  });
});

describe('quant honesty door status — data-lake path alignment (D39)', () => {
  it('edge door paths match connect.data-lake stage1 board constants', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
    expect(QUANT_SURFACE_RENDER_PATH).toBe(EDGE_QUANT_SURFACE_RENDER_DOOR);
    expect(QUANT_COMPOSITE_HONESTY_PATH).toBe(EDGE_QUANT_COMPOSITE_HONESTY_DOOR);
  });
});

describe('quant honesty door status — package labels (D46)', () => {
  it('doors label quant-honesty, connect-data-lake, and composite packages', () => {
    const status = describeQuantHonestyDoorStatus();
    const byPath = Object.fromEntries(status.doors.map((door) => [door.path, door.package]));
    expect(byPath[QUANT_HONESTY_ASSESS_PATH]).toBe('@intafaced/quant-honesty');
    expect(byPath['/quant/honesty/assess-comparison-order']).toBe('@intafaced/quant-honesty');
    expect(byPath['/quant/honesty/performance-labels']).toBe('@intafaced/quant-honesty');
    expect(byPath[EDGE_QUANT_SURFACE_RENDER_DOOR]).toBe('@intafaced/connect-data-lake');
    expect(byPath[EDGE_QUANT_COMPOSITE_HONESTY_DOOR]).toBe('composite');
  });
});
