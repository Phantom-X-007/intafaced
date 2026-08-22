import { describe, expect, it } from 'vitest';
import { DATA_LAKE_PACKAGE_EXPORTS } from './mount-vs-tracker.js';
import { EDGE_QUANT_COMPOSITE_HONESTY_DOOR, EDGE_QUANT_SURFACE_RENDER_DOOR, describeQuantSurfaceRefuse } from './quant-surface-refuse.js';

describe('edge quant door path guard (D40)', () => {
  it('exports door constants on package index and mount board', () => {
    expect(DATA_LAKE_PACKAGE_EXPORTS).toContain('EDGE_QUANT_SURFACE_RENDER_DOOR');
    expect(DATA_LAKE_PACKAGE_EXPORTS).toContain('EDGE_QUANT_COMPOSITE_HONESTY_DOOR');
    expect(EDGE_QUANT_SURFACE_RENDER_DOOR).toBe('/quant/honesty/assess-surface-render');
    expect(EDGE_QUANT_COMPOSITE_HONESTY_DOOR).toBe('/quant/honesty/assess-composite');
  });

  it('describeQuantSurfaceRefuse surfaces the same door paths', () => {
    const refuse = describeQuantSurfaceRefuse();
    expect(refuse.edgeSurfaceRenderDoor).toBe(EDGE_QUANT_SURFACE_RENDER_DOOR);
    expect(refuse.edgeCompositeHonestyDoor).toBe(EDGE_QUANT_COMPOSITE_HONESTY_DOOR);
    expect(refuse.edgeDoorNotProxiedToSvcQuant).toBe(true);
  });

  it('door paths stay under /quant/honesty/', () => {
    for (const path of [EDGE_QUANT_SURFACE_RENDER_DOOR, EDGE_QUANT_COMPOSITE_HONESTY_DOOR]) {
      expect(path.startsWith('/quant/honesty/')).toBe(true);
    }
  });
});
