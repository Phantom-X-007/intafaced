import { describe, expect, it } from 'vitest';
import {
  claimRefuseCatalogBoardCard,
  claimRefuseCatalogStatusLine,
  parseClaimRefuseCatalogStatusLine,
  claimRefuseCatalogStatusLineMatches,
  claimRefuseCatalogStatusLineConsistent,
  claimDecisionSimpleBoardCard,
  claimDecisionSimpleStatusLine,
  parseClaimDecisionSimpleStatusLine,
  claimDecisionSimpleStatusLineMatches,
  claimDecisionSimpleStatusLineConsistent,
  claimDecisionSimpleExportHeader,
  claimDecisionSimpleExportLine,
  claimDecisionSimpleExportText,
  isDeclaredClaimRefuseReason,
  CLAIM_REFUSE_REASONS,
  type ClaimDecisionBoardInput,
} from './claim-refuse-honesty.js';

describe('L3 wave152 claim refuse honesty', () => {
  it('catalog and decision boards', () => {
    expect(CLAIM_REFUSE_REASONS).toHaveLength(4);
    expect(claimRefuseCatalogBoardCard()).toEqual({
      reasons: 4,
      hasNotFound: 1,
      hasNotQueueable: 1,
      hasAlreadyClaimed: 1,
      hasInvalidOperator: 1,
    });
    expect(claimRefuseCatalogStatusLine()).toBe('reasons=4 not_found=1 not_queueable=1 already_claimed=1 invalid_operator=1');
    expect(claimRefuseCatalogStatusLineMatches()).toBe(true);
    expect(claimRefuseCatalogStatusLineConsistent(claimRefuseCatalogStatusLine())).toBe(true);
    expect(isDeclaredClaimRefuseReason('already_claimed')).toBe(true);
    expect(isDeclaredClaimRefuseReason('steal')).toBe(false);
    expect(parseClaimRefuseCatalogStatusLine('nope')).toBeNull();

    const ok: ClaimDecisionBoardInput = { status: 'ok' };
    expect(claimDecisionSimpleBoardCard(ok)).toEqual({ ok: 1, reason: '-' });
    expect(claimDecisionSimpleStatusLineMatches(ok)).toBe(true);
    expect(claimDecisionSimpleStatusLineConsistent(claimDecisionSimpleStatusLine(ok))).toBe(true);
    expect(claimDecisionSimpleExportText(ok).startsWith(claimDecisionSimpleExportHeader())).toBe(true);
    expect(claimDecisionSimpleExportLine(ok)).toBe('1,-');

    const refuse: ClaimDecisionBoardInput = {
      status: 'refuse',
      reason: 'not_queueable',
    };
    expect(claimDecisionSimpleStatusLine(refuse)).toBe('ok=0 reason=not_queueable');
    expect(claimDecisionSimpleStatusLineMatches(refuse)).toBe(true);
    expect(parseClaimDecisionSimpleStatusLine('nope')).toBeNull();
  });
});
