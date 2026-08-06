import { describe, expect, it } from 'vitest';
import {
  drillRunBoardCard,
  drillRunStatusLine,
  parseDrillRunStatusLine,
  drillRunStatusLineMatches,
  drillRunStatusLineConsistent,
  drillRunExportHeader,
  drillRunExportLine,
  drillRunExportText,
  drillIsFullyComplete,
  drillIsRefused,
  drillStepCountInRange,
  type DrillRunBoardInput,
} from './workbook-honesty.js';

describe('L3 wave78 paper workbook honesty', () => {
  it('active complete refused boards', () => {
    const active: DrillRunBoardInput = {
      status: 'active',
      stepCount: 4,
      completedCount: 1,
    };
    expect(drillRunBoardCard(active)).toEqual({
      status: 'active',
      steps: 4,
      completed: 1,
      remaining: 3,
      refuse: '-',
    });
    expect(drillRunStatusLine(active)).toBe(
      'status=active steps=4 completed=1 remaining=3 refuse=-',
    );
    expect(drillRunStatusLineMatches(active)).toBe(true);
    expect(drillRunStatusLineConsistent(drillRunStatusLine(active))).toBe(true);
    expect(drillIsFullyComplete(active)).toBe(false);
    expect(drillIsRefused(active)).toBe(false);

    const complete: DrillRunBoardInput = {
      status: 'complete',
      stepCount: 3,
      completedCount: 3,
    };
    expect(drillIsFullyComplete(complete)).toBe(true);
    expect(drillRunStatusLineMatches(complete)).toBe(true);
    expect(drillRunExportText(complete).startsWith(drillRunExportHeader())).toBe(true);
    expect(drillRunExportLine(complete)).toBe('complete,3,3,0,-');

    const refused: DrillRunBoardInput = {
      status: 'refused',
      stepCount: 2,
      completedCount: 1,
      refuseReason: 'not_paper',
    };
    expect(drillRunBoardCard(refused).completed).toBe(0);
    expect(drillRunBoardCard(refused).remaining).toBe(2);
    expect(drillRunStatusLine(refused)).toBe(
      'status=refused steps=2 completed=0 remaining=2 refuse=not_paper',
    );
    expect(drillRunStatusLineMatches(refused)).toBe(true);
    expect(drillRunStatusLineConsistent(drillRunStatusLine(refused))).toBe(true);
    expect(drillIsRefused(refused)).toBe(true);
    expect(drillStepCountInRange(refused, 2, 2)).toBe(true);
    expect(drillStepCountInRange(refused, 3, 1)).toBe(false);
    expect(parseDrillRunStatusLine('nope')).toBeNull();
  });
});
