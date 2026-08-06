import { describe, expect, it } from 'vitest';
import {
  supportGrounded,
  isSupportGroundedOk,
  supportGroundedBoardCard,
  supportGroundedStatusLine,
  parseSupportGroundedStatusLine,
  supportGroundedStatusLineMatches,
  supportGroundedExportHeader,
  supportGroundedExportLine,
  supportGroundedExportText,
} from './grounded.js';

describe('support agent Stage-2 grounded', () => {
  it('live allows classify/reply', () => {
    expect(supportGrounded({ plane: 'live' })).toEqual({
      status: 'ok',
      plane: 'live',
      allowedTasks: ['support.classify', 'support.reply'],
    });
  });

  it('dark desk refuses invent', () => {
    expect(supportGrounded({ plane: 'dark' }).status).toBe('refuse');
  });

  it('requireKb with zero hits refuses invent KB answers', () => {
    const r = supportGrounded({ plane: 'live', requireKb: true, kbHitCount: 0 });
    expect(r).toMatchObject({ status: 'refuse', reason: 'kb_empty' });
  });
});

describe('L3 wave51 support grounded status/export', () => {
  it('live and dark boards', () => {
    const live = supportGrounded({ plane: 'live' });
    expect(isSupportGroundedOk(live)).toBe(true);
    expect(supportGroundedBoardCard(live).taskCount).toBe(2);
    expect(supportGroundedStatusLineMatches(live)).toBe(true);
    expect(supportGroundedExportText(live).startsWith(supportGroundedExportHeader())).toBe(true);
    expect(parseSupportGroundedStatusLine('nope')).toBeNull();

    const dark = supportGrounded({ plane: 'dark' });
    expect(isSupportGroundedOk(dark)).toBe(false);
    expect(supportGroundedStatusLine(dark)).toContain('reason=desk_plane_dark');
    expect(supportGroundedStatusLineMatches(dark)).toBe(true);
    expect(supportGroundedExportLine(dark)).toContain('refuse');
  });
});
