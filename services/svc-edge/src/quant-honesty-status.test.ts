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

describe('quant honesty door status — surface render and composite paths (D61)', () => {
  it('describeQuantHonestyDoorStatus wires connect-data-lake surface render and composite assess doors', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.doors.find((door) => door.path === EDGE_QUANT_SURFACE_RENDER_DOOR)).toMatchObject({
      method: 'POST',
      package: '@intafaced/connect-data-lake',
    });
    expect(status.doors.find((door) => door.path === EDGE_QUANT_COMPOSITE_HONESTY_DOOR)).toMatchObject({
      method: 'POST',
      package: 'composite',
    });
    expect(QUANT_SURFACE_RENDER_PATH).toBe(EDGE_QUANT_SURFACE_RENDER_DOOR);
    expect(QUANT_COMPOSITE_HONESTY_PATH).toBe(EDGE_QUANT_COMPOSITE_HONESTY_DOOR);
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
  });
});

describe('quant honesty door status — complete door set (D63)', () => {
  it('describeQuantHonestyDoorStatus lists five unique doors with control plane mount honesty', () => {
    const status = describeQuantHonestyDoorStatus();
    const paths = status.doors.map((door) => door.path);
    expect(new Set(paths).size).toBe(5);
    expect(status.mountedOnControlPlane).toBe(true);
    expect(status.notProxiedToSvcQuant).toBe(true);
    expect(status.inventsReturns).toBe(false);
    expect(status.compositeHonestyWired).toBe(true);
  });
});

describe('quant honesty door status — package and method matrix (D64)', () => {
  it('describeQuantHonestyDoorStatus wires expected package and method per door', () => {
    const status = describeQuantHonestyDoorStatus();
    const byPath = Object.fromEntries(status.doors.map((door) => [door.path, door]));
    expect(byPath[QUANT_HONESTY_ASSESS_PATH]).toMatchObject({ method: 'POST', package: '@intafaced/quant-honesty' });
    expect(byPath[QUANT_HONESTY_COMPARISON_PATH]).toMatchObject({ method: 'POST', package: '@intafaced/quant-honesty' });
    expect(byPath[QUANT_HONESTY_LABELS_PATH]).toMatchObject({ method: 'GET', package: '@intafaced/quant-honesty' });
    expect(byPath[EDGE_QUANT_SURFACE_RENDER_DOOR]).toMatchObject({ method: 'POST', package: '@intafaced/connect-data-lake' });
    expect(byPath[EDGE_QUANT_COMPOSITE_HONESTY_DOOR]).toMatchObject({ method: 'POST', package: 'composite' });
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
    expect(status.statusLine).toMatch(/comparison/i);
    expect(QUANT_SURFACE_RENDER_PATH).toBe(EDGE_QUANT_SURFACE_RENDER_DOOR);
    expect(QUANT_COMPOSITE_HONESTY_PATH).toBe(EDGE_QUANT_COMPOSITE_HONESTY_DOOR);
  });
});

describe('quant honesty door status — status line complete (D66)', () => {
  it('describeQuantHonestyDoorStatus statusLine names all mounted door families', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.statusLine).toMatch(/backtest/i);
    expect(status.statusLine).toMatch(/comparison/i);
    expect(status.statusLine).toMatch(/labels/i);
    expect(status.statusLine).toMatch(/surface render/i);
    expect(status.statusLine).toMatch(/composite assess/i);
    expect(status.statusLine).toMatch(/not proxied to svc-quant/i);
    expect(status.mountedOnControlPlane).toBe(true);
    expect(status.notProxiedToSvcQuant).toBe(true);
    expect(status.inventsReturns).toBe(false);
    expect(status.compositeHonestyWired).toBe(true);
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
    expect(status.doors).toHaveLength(5);
  });
});

describe('quant honesty door status — mount honesty complete (D69)', () => {
  it('describeQuantHonestyDoorStatus reports full mount honesty board with five aligned doors', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.mountedOnControlPlane).toBe(true);
    expect(status.notProxiedToSvcQuant).toBe(true);
    expect(status.inventsReturns).toBe(false);
    expect(status.compositeHonestyWired).toBe(true);
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
    const paths = status.doors.map((door) => door.path);
    expect(new Set(paths).size).toBe(5);
    expect(paths).toContain(QUANT_HONESTY_ASSESS_PATH);
    expect(paths).toContain(QUANT_HONESTY_COMPARISON_PATH);
    expect(paths).toContain(QUANT_HONESTY_LABELS_PATH);
    expect(paths).toContain(EDGE_QUANT_SURFACE_RENDER_DOOR);
    expect(paths).toContain(EDGE_QUANT_COMPOSITE_HONESTY_DOOR);
    expect(QUANT_SURFACE_RENDER_PATH).toBe(EDGE_QUANT_SURFACE_RENDER_DOOR);
    expect(QUANT_COMPOSITE_HONESTY_PATH).toBe(EDGE_QUANT_COMPOSITE_HONESTY_DOOR);
  });
});

describe('quant honesty door status — full honesty board complete (D72)', () => {
  it('describeQuantHonestyDoorStatus locks mount honesty, statusLine, and door alignment', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.statusLine).toMatch(/not proxied to svc-quant/i);
    expect(status.statusLine).toMatch(/comparison/i);
    expect(status.statusLine).toMatch(/surface render/i);
    expect(status.mountedOnControlPlane).toBe(true);
    expect(status.notProxiedToSvcQuant).toBe(true);
    expect(status.inventsReturns).toBe(false);
    expect(status.compositeHonestyWired).toBe(true);
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
    expect(new Set(status.doors.map((door) => door.path)).size).toBe(5);
    const byPath = Object.fromEntries(status.doors.map((door) => [door.path, door.package]));
    expect(byPath[EDGE_QUANT_SURFACE_RENDER_DOOR]).toBe('@intafaced/connect-data-lake');
    expect(byPath[EDGE_QUANT_COMPOSITE_HONESTY_DOOR]).toBe('composite');
    expect(byPath[QUANT_HONESTY_ASSESS_PATH]).toBe('@intafaced/quant-honesty');
  });
});

describe('quant honesty door status — denon cross-lane complete (D75)', () => {
  it('describeQuantHonestyDoorStatus full board green with data-lake path alignment', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.mountedOnControlPlane).toBe(true);
    expect(status.notProxiedToSvcQuant).toBe(true);
    expect(status.inventsReturns).toBe(false);
    expect(status.compositeHonestyWired).toBe(true);
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
    expect(status.doors).toHaveLength(5);
    expect(QUANT_SURFACE_RENDER_PATH).toBe(EDGE_QUANT_SURFACE_RENDER_DOOR);
    expect(QUANT_COMPOSITE_HONESTY_PATH).toBe(EDGE_QUANT_COMPOSITE_HONESTY_DOOR);
    const paths = status.doors.map((door) => door.path);
    expect(paths).toContain(QUANT_HONESTY_ASSESS_PATH);
    expect(paths).toContain(QUANT_HONESTY_COMPARISON_PATH);
    expect(paths).toContain(QUANT_HONESTY_LABELS_PATH);
    expect(paths).toContain(EDGE_QUANT_SURFACE_RENDER_DOOR);
    expect(paths).toContain(EDGE_QUANT_COMPOSITE_HONESTY_DOOR);
  });
});

describe('quant honesty door status — denon board complete (D77)', () => {
  it('full quant honesty board: statusLine, flags, doors, and data-lake alignment', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.statusLine).toMatch(/backtest/i);
    expect(status.statusLine).toMatch(/not proxied to svc-quant/i);
    expect(status.mountedOnControlPlane).toBe(true);
    expect(status.notProxiedToSvcQuant).toBe(true);
    expect(status.inventsReturns).toBe(false);
    expect(status.compositeHonestyWired).toBe(true);
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
    expect(status.doors).toHaveLength(5);
    const byPath = Object.fromEntries(status.doors.map((door) => [door.path, door]));
    expect(byPath[QUANT_HONESTY_ASSESS_PATH]).toMatchObject({ method: 'POST', package: '@intafaced/quant-honesty' });
    expect(byPath[EDGE_QUANT_SURFACE_RENDER_DOOR]).toMatchObject({ method: 'POST', package: '@intafaced/connect-data-lake' });
    expect(byPath[EDGE_QUANT_COMPOSITE_HONESTY_DOOR]).toMatchObject({ method: 'POST', package: 'composite' });
  });
});

describe('quant honesty door status — denon board complete (D79)', () => {
  it('full quant honesty mount board: doors, packages, flags, data-lake alignment', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.mountedOnControlPlane).toBe(true);
    expect(status.notProxiedToSvcQuant).toBe(true);
    expect(status.inventsReturns).toBe(false);
    expect(status.compositeHonestyWired).toBe(true);
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
    expect(status.doors).toHaveLength(5);
    expect(QUANT_SURFACE_RENDER_PATH).toBe(EDGE_QUANT_SURFACE_RENDER_DOOR);
    expect(QUANT_COMPOSITE_HONESTY_PATH).toBe(EDGE_QUANT_COMPOSITE_HONESTY_DOOR);
    expect(status.doors.map((door) => door.package)).toEqual([
      '@intafaced/quant-honesty',
      '@intafaced/quant-honesty',
      '@intafaced/quant-honesty',
      '@intafaced/connect-data-lake',
      'composite',
    ]);
  });
});

describe('quant honesty door status — denon board complete (D81)', () => {
  it('full quant honesty mount board: statusLine, doors, packages, flags, data-lake alignment', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.statusLine).toMatch(/backtest/i);
    expect(status.statusLine).toMatch(/not proxied to svc-quant/i);
    expect(status.mountedOnControlPlane).toBe(true);
    expect(status.notProxiedToSvcQuant).toBe(true);
    expect(status.inventsReturns).toBe(false);
    expect(status.compositeHonestyWired).toBe(true);
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
    expect(status.doors).toHaveLength(5);
    const byPath = Object.fromEntries(status.doors.map((door) => [door.path, door]));
    expect(byPath[QUANT_HONESTY_ASSESS_PATH]).toMatchObject({ method: 'POST', package: '@intafaced/quant-honesty' });
    expect(byPath[EDGE_QUANT_SURFACE_RENDER_DOOR]).toMatchObject({ method: 'POST', package: '@intafaced/connect-data-lake' });
    expect(byPath[EDGE_QUANT_COMPOSITE_HONESTY_DOOR]).toMatchObject({ method: 'POST', package: 'composite' });
  });
});

describe('quant honesty door status — denon board complete (D83)', () => {
  it('full quant honesty mount board: doors, packages, flags, data-lake alignment', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.mountedOnControlPlane).toBe(true);
    expect(status.notProxiedToSvcQuant).toBe(true);
    expect(status.inventsReturns).toBe(false);
    expect(status.compositeHonestyWired).toBe(true);
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
    expect(status.doors).toHaveLength(5);
    expect(QUANT_SURFACE_RENDER_PATH).toBe(EDGE_QUANT_SURFACE_RENDER_DOOR);
    expect(QUANT_COMPOSITE_HONESTY_PATH).toBe(EDGE_QUANT_COMPOSITE_HONESTY_DOOR);
    expect(status.doors.map((door) => door.package)).toEqual([
      '@intafaced/quant-honesty',
      '@intafaced/quant-honesty',
      '@intafaced/quant-honesty',
      '@intafaced/connect-data-lake',
      'composite',
    ]);
  });
});

describe('quant honesty door status — denon board complete (D85)', () => {
  it('full quant honesty mount board: statusLine, doors, packages, flags, data-lake alignment', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.statusLine).toMatch(/backtest/i);
    expect(status.statusLine).toMatch(/not proxied to svc-quant/i);
    expect(status.mountedOnControlPlane).toBe(true);
    expect(status.notProxiedToSvcQuant).toBe(true);
    expect(status.inventsReturns).toBe(false);
    expect(status.compositeHonestyWired).toBe(true);
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
    expect(status.doors).toHaveLength(5);
    const byPath = Object.fromEntries(status.doors.map((door) => [door.path, door]));
    expect(byPath[QUANT_HONESTY_ASSESS_PATH]).toMatchObject({ method: 'POST', package: '@intafaced/quant-honesty' });
    expect(byPath[EDGE_QUANT_SURFACE_RENDER_DOOR]).toMatchObject({ method: 'POST', package: '@intafaced/connect-data-lake' });
    expect(byPath[EDGE_QUANT_COMPOSITE_HONESTY_DOOR]).toMatchObject({ method: 'POST', package: 'composite' });
  });
});

describe('quant honesty door status — denon board complete (D87)', () => {
  it('full quant honesty mount board: doors, packages, flags, data-lake alignment', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.mountedOnControlPlane).toBe(true);
    expect(status.notProxiedToSvcQuant).toBe(true);
    expect(status.inventsReturns).toBe(false);
    expect(status.compositeHonestyWired).toBe(true);
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
    expect(status.doors).toHaveLength(5);
    expect(QUANT_SURFACE_RENDER_PATH).toBe(EDGE_QUANT_SURFACE_RENDER_DOOR);
    expect(QUANT_COMPOSITE_HONESTY_PATH).toBe(EDGE_QUANT_COMPOSITE_HONESTY_DOOR);
    expect(status.doors.map((door) => door.package)).toEqual([
      '@intafaced/quant-honesty',
      '@intafaced/quant-honesty',
      '@intafaced/quant-honesty',
      '@intafaced/connect-data-lake',
      'composite',
    ]);
  });
});

describe('quant honesty door status — denon board complete (D89)', () => {
  it('full quant honesty mount board: statusLine, doors, packages, flags, data-lake alignment', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.statusLine).toMatch(/backtest/i);
    expect(status.statusLine).toMatch(/not proxied to svc-quant/i);
    expect(status.mountedOnControlPlane).toBe(true);
    expect(status.notProxiedToSvcQuant).toBe(true);
    expect(status.inventsReturns).toBe(false);
    expect(status.compositeHonestyWired).toBe(true);
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
    expect(status.doors).toHaveLength(5);
    const byPath = Object.fromEntries(status.doors.map((door) => [door.path, door]));
    expect(byPath[QUANT_HONESTY_ASSESS_PATH]).toMatchObject({ method: 'POST', package: '@intafaced/quant-honesty' });
    expect(byPath[EDGE_QUANT_SURFACE_RENDER_DOOR]).toMatchObject({ method: 'POST', package: '@intafaced/connect-data-lake' });
    expect(byPath[EDGE_QUANT_COMPOSITE_HONESTY_DOOR]).toMatchObject({ method: 'POST', package: 'composite' });
  });
});

describe('quant honesty door status — denon board complete (D91)', () => {
  it('full quant honesty mount board: doors, packages, flags, data-lake alignment', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.mountedOnControlPlane).toBe(true);
    expect(status.notProxiedToSvcQuant).toBe(true);
    expect(status.inventsReturns).toBe(false);
    expect(status.compositeHonestyWired).toBe(true);
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
    expect(status.doors).toHaveLength(5);
    expect(QUANT_SURFACE_RENDER_PATH).toBe(EDGE_QUANT_SURFACE_RENDER_DOOR);
    expect(QUANT_COMPOSITE_HONESTY_PATH).toBe(EDGE_QUANT_COMPOSITE_HONESTY_DOOR);
    expect(status.doors.map((door) => door.package)).toEqual([
      '@intafaced/quant-honesty',
      '@intafaced/quant-honesty',
      '@intafaced/quant-honesty',
      '@intafaced/connect-data-lake',
      'composite',
    ]);
  });
});

describe('quant honesty door status — denon board complete (D93)', () => {
  it('full quant honesty mount board: doors, packages, flags, data-lake alignment', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.mountedOnControlPlane).toBe(true);
    expect(status.notProxiedToSvcQuant).toBe(true);
    expect(status.inventsReturns).toBe(false);
    expect(status.compositeHonestyWired).toBe(true);
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
    expect(status.doors).toHaveLength(5);
    expect(QUANT_SURFACE_RENDER_PATH).toBe(EDGE_QUANT_SURFACE_RENDER_DOOR);
    expect(QUANT_COMPOSITE_HONESTY_PATH).toBe(EDGE_QUANT_COMPOSITE_HONESTY_DOOR);
    expect(status.doors.map((door) => door.package)).toEqual([
      '@intafaced/quant-honesty',
      '@intafaced/quant-honesty',
      '@intafaced/quant-honesty',
      '@intafaced/connect-data-lake',
      'composite',
    ]);
  });
});

describe('quant honesty door status — denon board complete (D95)', () => {
  it('full quant honesty mount board: doors, packages, flags, data-lake alignment', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.mountedOnControlPlane).toBe(true);
    expect(status.notProxiedToSvcQuant).toBe(true);
    expect(status.inventsReturns).toBe(false);
    expect(status.compositeHonestyWired).toBe(true);
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
    expect(status.doors).toHaveLength(5);
    expect(QUANT_SURFACE_RENDER_PATH).toBe(EDGE_QUANT_SURFACE_RENDER_DOOR);
    expect(QUANT_COMPOSITE_HONESTY_PATH).toBe(EDGE_QUANT_COMPOSITE_HONESTY_DOOR);
    expect(status.doors.map((door) => door.package)).toEqual([
      '@intafaced/quant-honesty',
      '@intafaced/quant-honesty',
      '@intafaced/quant-honesty',
      '@intafaced/connect-data-lake',
      'composite',
    ]);
  });
});

describe('quant honesty door status — denon board complete (D97)', () => {
  it('full quant honesty mount board: doors, packages, flags, data-lake alignment', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.mountedOnControlPlane).toBe(true);
    expect(status.notProxiedToSvcQuant).toBe(true);
    expect(status.inventsReturns).toBe(false);
    expect(status.compositeHonestyWired).toBe(true);
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
    expect(status.doors).toHaveLength(5);
    expect(QUANT_SURFACE_RENDER_PATH).toBe(EDGE_QUANT_SURFACE_RENDER_DOOR);
    expect(QUANT_COMPOSITE_HONESTY_PATH).toBe(EDGE_QUANT_COMPOSITE_HONESTY_DOOR);
    expect(status.doors.map((door) => door.package)).toEqual([
      '@intafaced/quant-honesty',
      '@intafaced/quant-honesty',
      '@intafaced/quant-honesty',
      '@intafaced/connect-data-lake',
      'composite',
    ]);
  });
});

describe('quant honesty door status — denon board complete (D99)', () => {
  it('full quant honesty mount board: doors, packages, flags, data-lake alignment', () => {
    const status = describeQuantHonestyDoorStatus();
    expect(status.mountedOnControlPlane).toBe(true);
    expect(status.notProxiedToSvcQuant).toBe(true);
    expect(status.inventsReturns).toBe(false);
    expect(status.compositeHonestyWired).toBe(true);
    expect(status.edgeDoorPathsAlignedWithDataLake).toBe(true);
    expect(status.doors).toHaveLength(5);
    expect(QUANT_SURFACE_RENDER_PATH).toBe(EDGE_QUANT_SURFACE_RENDER_DOOR);
    expect(QUANT_COMPOSITE_HONESTY_PATH).toBe(EDGE_QUANT_COMPOSITE_HONESTY_DOOR);
    expect(status.doors.map((door) => door.package)).toEqual([
      '@intafaced/quant-honesty',
      '@intafaced/quant-honesty',
      '@intafaced/quant-honesty',
      '@intafaced/connect-data-lake',
      'composite',
    ]);
  });
});
