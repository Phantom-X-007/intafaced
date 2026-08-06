import { describe, expect, it } from 'vitest';
import {
  commentDraftBoardCard,
  commentDraftStatusLine,
  parseCommentDraftStatusLine,
  commentDraftStatusLineMatches,
  commentDraftStatusLineConsistent,
  commentDraftExportHeader,
  commentDraftExportLine,
  commentDraftExportText,
  commentDraftIsMoneyRefuse,
  commentDraftBodyLenInRange,
  type CommentDraftResultInput,
} from './comment-draft-honesty.js';

describe('L3 wave100 support comment draft honesty', () => {
  it('ok and refuse boards', () => {
    const ok: CommentDraftResultInput = {
      status: 'ok',
      ticketId: 't1',
      body: 'Please check MFA settings.',
    };
    expect(commentDraftBoardCard(ok).status).toBe('ok');
    expect(commentDraftBoardCard(ok).bodyLen).toBe(ok.body.length);
    expect(commentDraftStatusLineMatches(ok)).toBe(true);
    expect(commentDraftStatusLineConsistent(commentDraftStatusLine(ok))).toBe(true);
    expect(commentDraftExportText(ok).startsWith(commentDraftExportHeader())).toBe(true);
    expect(commentDraftExportLine(ok)).toContain('ok,');
    expect(commentDraftIsMoneyRefuse(ok)).toBe(false);
    expect(commentDraftBodyLenInRange(ok, 1, 100)).toBe(true);

    const money: CommentDraftResultInput = {
      status: 'refuse',
      reason: 'money_invent_language',
    };
    expect(commentDraftBoardCard(money)).toEqual({
      status: 'refuse',
      bodyLen: 0,
      reason: 'money_invent_language',
      moneyRefuse: 1,
    });
    expect(commentDraftStatusLine(money)).toBe(
      'status=refuse body_len=0 reason=money_invent_language money_refuse=1',
    );
    expect(commentDraftStatusLineMatches(money)).toBe(true);
    expect(commentDraftStatusLineConsistent(commentDraftStatusLine(money))).toBe(true);
    expect(commentDraftIsMoneyRefuse(money)).toBe(true);

    const empty: CommentDraftResultInput = { status: 'refuse', reason: 'empty_body' };
    expect(commentDraftIsMoneyRefuse(empty)).toBe(false);
    expect(commentDraftStatusLineMatches(empty)).toBe(true);
    expect(parseCommentDraftStatusLine('nope')).toBeNull();
  });
});
