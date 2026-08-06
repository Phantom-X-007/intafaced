import { describe, expect, it } from 'vitest';
import {
  freezeReasonLength,
  freezeReasonPresent,
  freezeReasonBoardCard,
  freezeReasonStatusLine,
  parseFreezeReasonStatusLine,
  freezeReasonStatusLineMatches,
  freezeReasonStatusLineConsistent,
  freezeReasonExportHeader,
  freezeReasonExportLine,
  freezeReasonExportText,
  freezeReasonLengthInRange,
} from './freeze-reason-honesty.js';

describe('L3 wave112 freeze reason honesty', () => {
  it('empty and present reason boards', () => {
    expect(freezeReasonLength({ reason: null })).toBe(0);
    expect(freezeReasonPresent({ reason: '  ' })).toBe(false);
    expect(freezeReasonBoardCard({ reason: undefined })).toEqual({
      length: 0,
      present: 0,
      empty: 1,
    });
    expect(freezeReasonStatusLineMatches({ reason: null })).toBe(true);
    expect(freezeReasonStatusLineConsistent(freezeReasonStatusLine({ reason: null }))).toBe(true);

    const ok = { reason: 'policy review' };
    expect(freezeReasonLength(ok)).toBe(13);
    expect(freezeReasonPresent(ok)).toBe(true);
    expect(freezeReasonStatusLine(ok)).toBe('length=13 present=1 empty=0');
    expect(freezeReasonStatusLineMatches(ok)).toBe(true);
    expect(freezeReasonStatusLineConsistent(freezeReasonStatusLine(ok))).toBe(true);
    expect(freezeReasonExportText(ok).startsWith(freezeReasonExportHeader())).toBe(true);
    expect(freezeReasonExportLine(ok)).toBe('13,1,0');
    expect(freezeReasonLengthInRange(ok, 1, 100)).toBe(true);
    expect(freezeReasonLengthInRange(ok, 20, 30)).toBe(false);
    expect(parseFreezeReasonStatusLine('nope')).toBeNull();
  });
});
