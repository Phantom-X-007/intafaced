import { describe, expect, it } from 'vitest';
import { EDGE_QUANT_COMPOSITE_HONESTY_DOOR, EDGE_QUANT_SURFACE_RENDER_DOOR } from '@intafaced/connect-data-lake';
import { QUANT_COMPOSITE_HONESTY_PATH } from './quant-composite-honesty-door.js';
import { QUANT_HONESTY_ASSESS_PATH, QUANT_HONESTY_COMPARISON_PATH, QUANT_HONESTY_LABELS_PATH } from './quant-honesty-door.js';
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

describe('quant honesty door status — control plane mount (D48)', () => {
  it('describeQuantHonestyDoorStatus asserts doors mount on control plane without svc-quant proxy', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.mountedOnControlPlane).toBe(true);
    expect(status.notProxiedToSvcQuant).toBe(true);
    expect(status.statusLine).toMatch(/not proxied to svc-quant/i);
  });
});

describe('quant honesty door status — HTTP methods (D50)', () => {
  it('doors label POST assess paths and GET performance labels', () => {
    const status = describeQuantHonestyDoorStatus();
    const byPath = Object.fromEntries(status.doors.map((door) => [door.path, door.method]));
    expect(byPath[QUANT_HONESTY_ASSESS_PATH]).toBe('POST');
    expect(byPath['/quant/honesty/assess-comparison-order']).toBe('POST');
    expect(byPath['/quant/honesty/performance-labels']).toBe('GET');
    expect(byPath[EDGE_QUANT_SURFACE_RENDER_DOOR]).toBe('POST');
    expect(byPath[EDGE_QUANT_COMPOSITE_HONESTY_DOOR]).toBe('POST');
  });
});

describe('quant honesty door status — returns honesty (D52)', () => {
  it('describeQuantHonestyDoorStatus lists five doors and refuses invented returns', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.inventsReturns).toBe(false);
    expect(status.compositeHonestyWired).toBe(true);
    expect(status.doors).toHaveLength(5);
  });
});

describe('quant honesty door status — status line (D54)', () => {
  it('statusLine names backtest, surface render, composite assess, and svc-quant refusal', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.statusLine).toMatch(/backtest/i);
    expect(status.statusLine).toMatch(/surface render/i);
    expect(status.statusLine).toMatch(/composite assess/i);
    expect(status.statusLine).toMatch(/not proxied to svc-quant/i);
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
  });
});

describe('quant honesty door status — comparison path (D57)', () => {
  it('describeQuantHonestyDoorStatus includes comparison-order assess door', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.doors.map((door) => door.path)).toContain(QUANT_HONESTY_COMPARISON_PATH);
    expect(status.doors.find((door) => door.path === QUANT_HONESTY_COMPARISON_PATH)).toMatchObject({
      method: 'POST',
      package: '@intafaced/quant-honesty',
    });
  });
});

describe('quant honesty door status — performance labels path (D59)', () => {
  it('describeQuantHonestyDoorStatus includes performance-labels GET door', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.doors.map((door) => door.path)).toContain(QUANT_HONESTY_LABELS_PATH);
    expect(status.doors.find((door) => door.path === QUANT_HONESTY_LABELS_PATH)).toMatchObject({
      method: 'GET',
      package: '@intafaced/quant-honesty',
    });
    expect(status.doors.find((door) => door.path === QUANT_HONESTY_ASSESS_PATH)).toMatchObject({
      method: 'POST',
      package: '@intafaced/quant-honesty',
    });
  });
});
