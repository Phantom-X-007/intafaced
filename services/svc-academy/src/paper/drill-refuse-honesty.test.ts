import { describe, expect, it } from 'vitest';
import {
  drillRefuseCatalogBoardCard,
  drillRefuseCatalogStatusLine,
  parseDrillRefuseCatalogStatusLine,
  drillRefuseCatalogStatusLineMatches,
  drillResultBoardCard,
  drillResultStatusLine,
  parseDrillResultStatusLine,
  drillResultStatusLineMatches,
  drillResultStatusLineConsistent,
  drillResultExportHeader,
  drillResultExportLine,
  drillResultExportText,
  isDeclaredDrillRefuseReason,
  DRILL_REFUSE_REASONS,
  type DrillResultBoardInput,
} from './drill-refuse-honesty.js';

describe('L3 wave129 paper drill refuse honesty', () => {
  it('catalog and result boards', () => {
    expect(DRILL_REFUSE_REASONS).toHaveLength(4);
    expect(drillRefuseCatalogBoardCard()).toEqual({
      reasons: 4,
      hasNotPaper: 1,
      hasBadFill: 1,
    });
    expect(drillRefuseCatalogStatusLineMatches()).toBe(true);
    expect(parseDrillRefuseCatalogStatusLine(drillRefuseCatalogStatusLine())).toEqual({
      reasons: 4,
      notPaper: 1,
      badFill: 1,
    });
    expect(isDeclaredDrillRefuseReason('not_paper')).toBe(true);
    expect(isDeclaredDrillRefuseReason('live_ok')).toBe(false);

    const active: DrillResultBoardInput = { status: 'active' };
    expect(drillResultBoardCard(active).refused).toBe(0);
    expect(drillResultStatusLineMatches(active)).toBe(true);
    expect(drillResultStatusLineConsistent(drillResultStatusLine(active))).toBe(true);

    const refused: DrillResultBoardInput = { status: 'refused', reason: 'not_paper' };
    expect(drillResultStatusLine(refused)).toBe('status=refused reason=not_paper refused=1');
    expect(drillResultStatusLineMatches(refused)).toBe(true);
    expect(drillResultExportText(refused).startsWith(drillResultExportHeader())).toBe(true);
    expect(drillResultExportLine(refused)).toBe('refused,not_paper,1');
    expect(parseDrillResultStatusLine('nope')).toBeNull();
  });
});
