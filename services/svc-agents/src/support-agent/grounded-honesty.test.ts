import { describe, expect, it } from 'vitest';
import {
  supportGroundedBoardCard,
  supportGroundedStatusLine,
  parseSupportGroundedStatusLine,
  supportGroundedStatusLineMatches,
  supportGroundedStatusLineConsistent,
  supportGroundedExportHeader,
  supportGroundedExportLine,
  supportGroundedExportText,
  liveSupportGrounded,
  darkSupportGrounded,
  emptyKbSupportGrounded,
} from './grounded-honesty.js';

describe('L3 wave102 support grounded honesty', () => {
  it('live dark kb_empty boards', () => {
    const live = liveSupportGrounded();
    expect(supportGroundedBoardCard(live)).toEqual({
      status: 'ok',
      plane: 'live',
      tasks: 2,
      reason: '-',
    });
    expect(supportGroundedStatusLine(live)).toBe('status=ok plane=live tasks=2 reason=-');
    expect(supportGroundedStatusLineMatches(live)).toBe(true);
    expect(supportGroundedStatusLineConsistent(supportGroundedStatusLine(live))).toBe(true);
    expect(supportGroundedExportText(live).startsWith(supportGroundedExportHeader())).toBe(true);
    expect(supportGroundedExportLine(live)).toBe('ok,live,2,-');

    const dark = darkSupportGrounded();
    expect(supportGroundedBoardCard(dark).reason).toBe('desk_plane_dark');
    expect(supportGroundedStatusLineMatches(dark)).toBe(true);
    expect(supportGroundedStatusLineConsistent(supportGroundedStatusLine(dark))).toBe(true);

    const kb = emptyKbSupportGrounded();
    expect(supportGroundedBoardCard(kb).reason).toBe('kb_empty');
    expect(supportGroundedStatusLineMatches(kb)).toBe(true);
    expect(parseSupportGroundedStatusLine('nope')).toBeNull();
  });
});
