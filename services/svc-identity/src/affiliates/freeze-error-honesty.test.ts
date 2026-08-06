import { describe, expect, it } from 'vitest';
import {
  freezeErrorCatalogBoardCard,
  freezeErrorCatalogStatusLine,
  parseFreezeErrorCatalogStatusLine,
  freezeErrorCatalogStatusLineMatches,
  freezeErrorCatalogStatusLineConsistent,
  freezeErrorCatalogExportHeader,
  freezeErrorCatalogExportLines,
  freezeErrorCatalogExportText,
  isDeclaredFreezeErrorCode,
  FREEZE_ERROR_CODES,
} from './freeze-error-honesty.js';

describe('L3 wave120 freeze error catalog honesty', () => {
  it('error code catalog boards', () => {
    expect(FREEZE_ERROR_CODES).toHaveLength(4);
    expect(freezeErrorCatalogBoardCard()).toEqual({
      codes: 4,
      hasAlready: 1,
      hasNotFound: 1,
    });
    expect(freezeErrorCatalogStatusLine()).toBe('codes=4 already=1 not_found=1');
    expect(freezeErrorCatalogStatusLineMatches()).toBe(true);
    expect(freezeErrorCatalogStatusLineConsistent(freezeErrorCatalogStatusLine())).toBe(true);
    expect(freezeErrorCatalogExportText().startsWith(freezeErrorCatalogExportHeader())).toBe(true);
    expect(freezeErrorCatalogExportLines()).toEqual([...FREEZE_ERROR_CODES]);
    expect(isDeclaredFreezeErrorCode('freeze.already')).toBe(true);
    expect(isDeclaredFreezeErrorCode('freeze.paid')).toBe(false);
    expect(parseFreezeErrorCatalogStatusLine('nope')).toBeNull();
  });
});
