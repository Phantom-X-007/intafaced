import { describe, expect, it } from 'vitest';
import {
  reconcileActionCatalogBoardCard,
  reconcileActionCatalogStatusLine,
  parseReconcileActionCatalogStatusLine,
  reconcileActionCatalogStatusLineMatches,
  reconcileActionCatalogStatusLineConsistent,
  reconcileActionCatalogExportHeader,
  reconcileActionCatalogExportLines,
  reconcileActionCatalogExportText,
  isDeclaredReconcileAction,
  RECONCILE_ACTIONS,
} from './reconcile-action-honesty.js';

describe('L3 wave190 reconcile-action catalog honesty', () => {
  it('reconcile action catalog boards', () => {
    expect(RECONCILE_ACTIONS).toEqual(['deleted', 'released', 'fail_closed', 'none']);
    expect(reconcileActionCatalogBoardCard()).toEqual({
      actions: 4,
      hasDeleted: 1,
      hasReleased: 1,
      hasFailClosed: 1,
      hasNone: 1,
    });
    expect(reconcileActionCatalogStatusLine()).toBe('actions=4 deleted=1 released=1 fail_closed=1 none=1');
    expect(reconcileActionCatalogStatusLineMatches()).toBe(true);
    expect(reconcileActionCatalogStatusLineConsistent(reconcileActionCatalogStatusLine())).toBe(true);
    expect(reconcileActionCatalogExportText().startsWith(reconcileActionCatalogExportHeader())).toBe(true);
    expect(reconcileActionCatalogExportLines()).toEqual([...RECONCILE_ACTIONS]);
    expect(isDeclaredReconcileAction('fail_closed')).toBe(true);
    expect(isDeclaredReconcileAction('force')).toBe(false);
    expect(parseReconcileActionCatalogStatusLine('nope')).toBeNull();
  });
});
