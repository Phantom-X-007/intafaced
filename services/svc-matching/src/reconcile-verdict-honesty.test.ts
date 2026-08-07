import { describe, expect, it } from 'vitest';
import {
  reconcileVerdictCatalogBoardCard,
  reconcileVerdictCatalogStatusLine,
  parseReconcileVerdictCatalogStatusLine,
  reconcileVerdictCatalogStatusLineMatches,
  reconcileVerdictCatalogStatusLineConsistent,
  reconcileVerdictCatalogExportHeader,
  reconcileVerdictCatalogExportLines,
  reconcileVerdictCatalogExportText,
  isDeclaredReconcileVerdict,
  RECONCILE_VERDICTS,
} from './reconcile-verdict-honesty.js';

describe('L3 wave184 reconcile-verdict catalog honesty', () => {
  it('reconcile verdict catalog boards', () => {
    expect(RECONCILE_VERDICTS).toEqual(['clean', 'auto', 'refuse']);
    expect(reconcileVerdictCatalogBoardCard()).toEqual({
      verdicts: 3,
      hasClean: 1,
      hasAuto: 1,
      hasRefuse: 1,
    });
    expect(reconcileVerdictCatalogStatusLine()).toBe('verdicts=3 clean=1 auto=1 refuse=1');
    expect(reconcileVerdictCatalogStatusLineMatches()).toBe(true);
    expect(reconcileVerdictCatalogStatusLineConsistent(reconcileVerdictCatalogStatusLine())).toBe(true);
    expect(reconcileVerdictCatalogExportText().startsWith(reconcileVerdictCatalogExportHeader())).toBe(true);
    expect(reconcileVerdictCatalogExportLines()).toEqual([...RECONCILE_VERDICTS]);
    expect(isDeclaredReconcileVerdict('refuse')).toBe(true);
    expect(isDeclaredReconcileVerdict('force')).toBe(false);
    expect(parseReconcileVerdictCatalogStatusLine('nope')).toBeNull();
  });
});
