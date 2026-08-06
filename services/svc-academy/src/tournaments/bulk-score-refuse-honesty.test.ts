import { describe, expect, it } from 'vitest';
import {
  bulkScoreRefuseCatalogBoardCard,
  bulkScoreRefuseCatalogStatusLine,
  parseBulkScoreRefuseCatalogStatusLine,
  bulkScoreRefuseCatalogStatusLineMatches,
  bulkScoreResultBoardCard,
  bulkScoreResultStatusLine,
  parseBulkScoreResultStatusLine,
  bulkScoreResultStatusLineMatches,
  bulkScoreResultStatusLineConsistent,
  bulkScoreResultExportHeader,
  bulkScoreResultExportLine,
  bulkScoreResultExportText,
  isDeclaredBulkScoreRefuseReason,
  BULK_SCORE_REFUSE_REASONS,
  type BulkScoreResultBoardInput,
} from './bulk-score-refuse-honesty.js';

describe('L3 wave126 bulk-score refuse honesty', () => {
  it('catalog and result boards', () => {
    expect(BULK_SCORE_REFUSE_REASONS).toHaveLength(4);
    expect(bulkScoreRefuseCatalogBoardCard()).toEqual({
      reasons: 4,
      hasEmpty: 1,
      hasSeasonNotLive: 1,
    });
    expect(bulkScoreRefuseCatalogStatusLineMatches()).toBe(true);
    expect(parseBulkScoreRefuseCatalogStatusLine(bulkScoreRefuseCatalogStatusLine())).toEqual({
      reasons: 4,
      empty: 1,
      seasonNotLive: 1,
    });
    expect(isDeclaredBulkScoreRefuseReason('duplicate_user')).toBe(true);
    expect(isDeclaredBulkScoreRefuseReason('invented')).toBe(false);

    const ok: BulkScoreResultBoardInput = { status: 'ok', accepted: 3 };
    expect(bulkScoreResultBoardCard(ok)).toEqual({ status: 'ok', accepted: 3, reason: '-' });
    expect(bulkScoreResultStatusLineMatches(ok)).toBe(true);
    expect(bulkScoreResultStatusLineConsistent(bulkScoreResultStatusLine(ok))).toBe(true);
    expect(bulkScoreResultExportText(ok).startsWith(bulkScoreResultExportHeader())).toBe(true);
    expect(bulkScoreResultExportLine(ok)).toBe('ok,3,-');

    const refuse: BulkScoreResultBoardInput = {
      status: 'refuse',
      reason: 'season_not_live',
    };
    expect(bulkScoreResultStatusLine(refuse)).toBe(
      'status=refuse accepted=0 reason=season_not_live',
    );
    expect(bulkScoreResultStatusLineMatches(refuse)).toBe(true);
    expect(bulkScoreResultStatusLineConsistent(bulkScoreResultStatusLine(refuse))).toBe(true);
    expect(parseBulkScoreResultStatusLine('nope')).toBeNull();
  });
});
