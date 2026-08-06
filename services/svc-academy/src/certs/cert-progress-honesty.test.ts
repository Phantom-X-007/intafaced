import { describe, expect, it } from 'vitest';
import {
  certProgressBoardCard,
  certProgressStatusLine,
  parseCertProgressStatusLine,
  certProgressStatusLineMatches,
  certProgressStatusLineConsistent,
  certProgressExportHeader,
  certProgressExportLine,
  certProgressExportText,
  certIncompleteBlocksGrant,
  type CertProgressBoardInput,
} from './cert-progress-honesty.js';

describe('L3 wave133 cert progress honesty', () => {
  it('incomplete and complete progress boards', () => {
    const incomplete: CertProgressBoardInput = {
      enrolled: 1,
      completedItems: 1,
      requiredItems: 3,
      granted: 0,
    };
    expect(certProgressBoardCard(incomplete).complete).toBe(0);
    expect(certProgressStatusLine(incomplete)).toBe('enrolled=1 completed=1 required=3 granted=0 complete=0');
    expect(certProgressStatusLineMatches(incomplete)).toBe(true);
    expect(certProgressStatusLineConsistent(certProgressStatusLine(incomplete))).toBe(true);
    expect(certIncompleteBlocksGrant(incomplete)).toBe(true);

    const complete: CertProgressBoardInput = {
      enrolled: 1,
      completedItems: 3,
      requiredItems: 3,
      granted: 1,
    };
    expect(certProgressBoardCard(complete).complete).toBe(1);
    expect(certProgressStatusLineMatches(complete)).toBe(true);
    expect(certProgressExportText(complete).startsWith(certProgressExportHeader())).toBe(true);
    expect(certProgressExportLine(complete)).toBe('1,3,3,1,1');
    expect(parseCertProgressStatusLine('nope')).toBeNull();
  });
});
