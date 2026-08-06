import { describe, expect, it } from 'vitest';
import {
  copyPlaneCatalogBoardCard,
  copyPlaneCatalogStatusLine,
  parseCopyPlaneCatalogStatusLine,
  copyPlaneCatalogStatusLineMatches,
  copyPlaneCatalogStatusLineConsistent,
  copyPlaneCatalogExportHeader,
  copyPlaneCatalogExportLines,
  copyPlaneCatalogExportText,
  isDeclaredCopyPlaneState,
  COPY_PLANE_STATES,
} from './copy-plane-honesty.js';

describe('L3 wave174 copy plane state catalog honesty', () => {
  it('copy plane catalog boards', () => {
    expect(COPY_PLANE_STATES).toEqual(['live', 'dark']);
    expect(copyPlaneCatalogBoardCard()).toEqual({
      states: 2,
      hasLive: 1,
      hasDark: 1,
    });
    expect(copyPlaneCatalogStatusLine()).toBe('states=2 live=1 dark=1');
    expect(copyPlaneCatalogStatusLineMatches()).toBe(true);
    expect(copyPlaneCatalogStatusLineConsistent(copyPlaneCatalogStatusLine())).toBe(true);
    expect(copyPlaneCatalogExportText().startsWith(copyPlaneCatalogExportHeader())).toBe(true);
    expect(copyPlaneCatalogExportLines()).toEqual([...COPY_PLANE_STATES]);
    expect(isDeclaredCopyPlaneState('dark')).toBe(true);
    expect(isDeclaredCopyPlaneState('degraded')).toBe(false);
    expect(parseCopyPlaneCatalogStatusLine('nope')).toBeNull();
  });
});
