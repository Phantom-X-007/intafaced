import { describe, expect, it } from 'vitest';
import {
  planeStateCatalogBoardCard,
  planeStateCatalogStatusLine,
  parsePlaneStateCatalogStatusLine,
  planeStateCatalogStatusLineMatches,
  planeStateCatalogStatusLineConsistent,
  darkPlaneRefusesInvent,
  multiPlaneBoardCard,
  multiPlaneStatusLine,
  parseMultiPlaneStatusLine,
  multiPlaneStatusLineMatches,
  multiPlaneStatusLineConsistent,
  multiPlaneExportHeader,
  multiPlaneExportLine,
  multiPlaneExportText,
  isDeclaredPlaneState,
  PLANE_STATES,
  type PlaneStateId,
} from './plane-state-honesty.js';

describe('L3 wave146 plane state honesty', () => {
  it('catalog and multi-plane boards', () => {
    expect(PLANE_STATES).toEqual(['live', 'dark']);
    expect(planeStateCatalogBoardCard()).toEqual({ states: 2, hasLive: 1, hasDark: 1 });
    expect(planeStateCatalogStatusLine()).toBe('states=2 live=1 dark=1');
    expect(planeStateCatalogStatusLineMatches()).toBe(true);
    expect(planeStateCatalogStatusLineConsistent(planeStateCatalogStatusLine())).toBe(true);
    expect(darkPlaneRefusesInvent('dark')).toBe(true);
    expect(darkPlaneRefusesInvent('live')).toBe(false);
    expect(isDeclaredPlaneState('dark')).toBe(true);
    expect(isDeclaredPlaneState('degraded')).toBe(false);
    expect(parsePlaneStateCatalogStatusLine('nope')).toBeNull();

    const planes: Readonly<Record<string, PlaneStateId>> = {
      trade: 'live',
      pay: 'dark',
      copy: 'live',
    };
    expect(multiPlaneBoardCard(planes)).toEqual({ named: 3, live: 2, dark: 1 });
    expect(multiPlaneStatusLine(planes)).toBe('named=3 live=2 dark=1');
    expect(multiPlaneStatusLineMatches(planes)).toBe(true);
    expect(multiPlaneStatusLineConsistent(multiPlaneStatusLine(planes))).toBe(true);
    expect(multiPlaneExportText(planes).startsWith(multiPlaneExportHeader())).toBe(true);
    expect(multiPlaneExportLine(planes)).toBe('3,2,1');
    expect(parseMultiPlaneStatusLine('nope')).toBeNull();
  });
});
