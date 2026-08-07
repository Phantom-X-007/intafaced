import { describe, expect, it } from 'vitest';
import {
  launchDropCatalogBoardCard,
  launchDropCatalogStatusLine,
  parseLaunchDropCatalogStatusLine,
  launchDropCatalogStatusLineMatches,
  launchDropCatalogStatusLineConsistent,
  launchDropCatalogExportHeader,
  launchDropCatalogExportLines,
  launchDropCatalogExportText,
  isDeclaredLaunchDrop,
  LAUNCH_DROPS,
} from './launch-drop-honesty.js';

describe('L3 wave211 launch-drop catalog honesty', () => {
  it('launch drop catalog boards', () => {
    expect(LAUNCH_DROPS).toEqual(['0', 'I', 'II', 'III', 'IV', 'V']);
    expect(launchDropCatalogBoardCard()).toEqual({
      drops: 6,
      hasZero: 1,
      hasV: 1,
      hasI: 1,
      hasIII: 1,
    });
    expect(launchDropCatalogStatusLine()).toBe('drops=6 zero=1 i=1 iii=1 v=1');
    expect(launchDropCatalogStatusLineMatches()).toBe(true);
    expect(launchDropCatalogStatusLineConsistent(launchDropCatalogStatusLine())).toBe(true);
    expect(launchDropCatalogExportText().startsWith(launchDropCatalogExportHeader())).toBe(true);
    expect(launchDropCatalogExportLines()).toEqual([...LAUNCH_DROPS]);
    expect(isDeclaredLaunchDrop('IV')).toBe(true);
    expect(isDeclaredLaunchDrop('VI')).toBe(false);
    expect(parseLaunchDropCatalogStatusLine('nope')).toBeNull();
  });
});
