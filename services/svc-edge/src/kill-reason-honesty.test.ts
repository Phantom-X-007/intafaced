import { describe, expect, it } from 'vitest';
import {
  killReasonCatalogBoardCard,
  killReasonCatalogStatusLine,
  parseKillReasonCatalogStatusLine,
  killReasonCatalogStatusLineMatches,
  killReasonCatalogStatusLineConsistent,
  killReasonCatalogExportHeader,
  killReasonCatalogExportLines,
  killReasonCatalogExportText,
  isDeclaredKillReason,
  KILL_REASONS,
} from './kill-reason-honesty.js';

describe('L3 wave179 kill-reason catalog honesty', () => {
  it('kill reason catalog boards', () => {
    expect(KILL_REASONS).toEqual(['not-killed', 'read-only', 'lets-the-user-out', 'module-killed', 'no-route', 'undecidable']);
    expect(killReasonCatalogBoardCard()).toEqual({
      reasons: 6,
      hasNotKilled: 1,
      hasModuleKilled: 1,
      hasLetsUserOut: 1,
      hasUndecidable: 1,
    });
    expect(killReasonCatalogStatusLine()).toBe('reasons=6 not_killed=1 module_killed=1 lets_user_out=1 undecidable=1');
    expect(killReasonCatalogStatusLineMatches()).toBe(true);
    expect(killReasonCatalogStatusLineConsistent(killReasonCatalogStatusLine())).toBe(true);
    expect(killReasonCatalogExportText().startsWith(killReasonCatalogExportHeader())).toBe(true);
    expect(killReasonCatalogExportLines()).toEqual([...KILL_REASONS]);
    expect(isDeclaredKillReason('lets-the-user-out')).toBe(true);
    expect(isDeclaredKillReason('trap-funds')).toBe(false);
    expect(parseKillReasonCatalogStatusLine('nope')).toBeNull();
  });
});
