import { describe, expect, it } from 'vitest';
import {
  freezeReasonOk,
  freezeReasonGateBoardCard,
  freezeReasonGateStatusLine,
  parseFreezeReasonGateStatusLine,
  freezeReasonGateStatusLineMatches,
  freezeReasonGateStatusLineConsistent,
  freezeReasonGateExportHeader,
  freezeReasonGateExportLine,
  freezeReasonGateExportText,
} from './freeze-error-code-list-honesty.js';

describe('L3 wave124 freeze reason gate honesty', () => {
  it('empty and present reason gates', () => {
    expect(freezeReasonOk(null)).toBe(false);
    expect(freezeReasonOk('  ')).toBe(false);
    expect(freezeReasonGateBoardCard(null)).toEqual({ length: 0, ok: 0, refuse: 1 });
    expect(freezeReasonGateStatusLineMatches(null)).toBe(true);
    expect(freezeReasonGateStatusLineConsistent(freezeReasonGateStatusLine(null))).toBe(true);

    expect(freezeReasonOk('ops review')).toBe(true);
    expect(freezeReasonGateStatusLine('ops review')).toBe('length=10 ok=1 refuse=0');
    expect(freezeReasonGateStatusLineMatches('ops review')).toBe(true);
    expect(freezeReasonGateExportText('ops review').startsWith(freezeReasonGateExportHeader())).toBe(true);
    expect(freezeReasonGateExportLine('ops review')).toBe('10,1,0');
    expect(parseFreezeReasonGateStatusLine('nope')).toBeNull();
  });
});
