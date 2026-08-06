import { describe, expect, it } from 'vitest';
import {
  outOfAppSendStatusCatalogBoardCard,
  outOfAppSendStatusCatalogStatusLine,
  parseOutOfAppSendStatusCatalogStatusLine,
  outOfAppSendStatusCatalogStatusLineMatches,
  outOfAppSendStatusCatalogStatusLineConsistent,
  outOfAppSendStatusCatalogExportHeader,
  outOfAppSendStatusCatalogExportLines,
  outOfAppSendStatusCatalogExportText,
  isDeclaredOutOfAppSendStatus,
  OUT_OF_APP_SEND_STATUSES,
} from './out-of-app-send-status-honesty.js';

describe('L3 wave172 out-of-app send-status catalog honesty', () => {
  it('status catalog boards', () => {
    expect(OUT_OF_APP_SEND_STATUSES).toEqual(['sent', 'refused', 'failed']);
    expect(outOfAppSendStatusCatalogBoardCard()).toEqual({
      statuses: 3,
      hasSent: 1,
      hasRefused: 1,
      hasFailed: 1,
    });
    expect(outOfAppSendStatusCatalogStatusLine()).toBe('statuses=3 sent=1 refused=1 failed=1');
    expect(outOfAppSendStatusCatalogStatusLineMatches()).toBe(true);
    expect(outOfAppSendStatusCatalogStatusLineConsistent(outOfAppSendStatusCatalogStatusLine())).toBe(true);
    expect(outOfAppSendStatusCatalogExportText().startsWith(outOfAppSendStatusCatalogExportHeader())).toBe(true);
    expect(outOfAppSendStatusCatalogExportLines()).toEqual([...OUT_OF_APP_SEND_STATUSES]);
    expect(isDeclaredOutOfAppSendStatus('sent')).toBe(true);
    expect(isDeclaredOutOfAppSendStatus('pending')).toBe(false);
    expect(parseOutOfAppSendStatusCatalogStatusLine('nope')).toBeNull();
  });
});
