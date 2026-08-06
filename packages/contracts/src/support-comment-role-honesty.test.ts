import { describe, expect, it } from 'vitest';
import {
  supportCommentRoleCatalogBoardCard,
  supportCommentRoleCatalogStatusLine,
  parseSupportCommentRoleCatalogStatusLine,
  supportCommentRoleCatalogStatusLineMatches,
  supportCommentRoleCatalogStatusLineConsistent,
  supportCommentRoleCatalogExportHeader,
  supportCommentRoleCatalogExportLines,
  supportCommentRoleCatalogExportText,
  isDeclaredSupportCommentRole,
  SUPPORT_COMMENT_ROLES,
} from './support-comment-role-honesty.js';

describe('L3 wave153 support comment role catalog honesty', () => {
  it('role catalog boards', () => {
    expect(SUPPORT_COMMENT_ROLES).toEqual(['user', 'operator']);
    expect(supportCommentRoleCatalogBoardCard()).toEqual({
      roles: 2,
      hasUser: 1,
      hasOperator: 1,
    });
    expect(supportCommentRoleCatalogStatusLine()).toBe('roles=2 user=1 operator=1');
    expect(supportCommentRoleCatalogStatusLineMatches()).toBe(true);
    expect(supportCommentRoleCatalogStatusLineConsistent(supportCommentRoleCatalogStatusLine())).toBe(true);
    expect(supportCommentRoleCatalogExportText().startsWith(supportCommentRoleCatalogExportHeader())).toBe(true);
    expect(supportCommentRoleCatalogExportLines()).toEqual([...SUPPORT_COMMENT_ROLES]);
    expect(isDeclaredSupportCommentRole('operator')).toBe(true);
    expect(isDeclaredSupportCommentRole('admin')).toBe(false);
    expect(parseSupportCommentRoleCatalogStatusLine('nope')).toBeNull();
  });
});
