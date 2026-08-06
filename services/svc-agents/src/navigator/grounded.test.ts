import { describe, expect, it } from 'vitest';
import {
  navigatorGrounded,
  isNavigatorGroundedOk,
  navigatorGroundedBoardCard,
  navigatorGroundedStatusLine,
  parseNavigatorGroundedStatusLine,
  navigatorGroundedStatusLineMatches,
  navigatorGroundedExportHeader,
  navigatorGroundedExportLine,
  navigatorGroundedExportText,
  isTradePlaneLive,
} from './grounded.js';

describe('navigator Stage-2 grounded plane', () => {
  it('live allows plan/tool_select tasks', () => {
    expect(navigatorGrounded('live')).toEqual({
      status: 'ok',
      plane: 'live',
      allowedTasks: ['navigator.plan', 'navigator.tool_select'],
    });
  });

  it('dark refuses invent market context', () => {
    expect(navigatorGrounded('dark')).toEqual({
      status: 'refuse',
      plane: 'dark',
      reason: 'trade_plane_dark',
      userMessageKey: 'agents.navigator.unavailable',
    });
  });
});

describe('L3 wave51 navigator grounded status/export', () => {
  it('live and dark boards', () => {
    const live = navigatorGrounded('live');
    expect(isNavigatorGroundedOk(live)).toBe(true);
    expect(isTradePlaneLive('live')).toBe(true);
    expect(navigatorGroundedBoardCard(live).taskCount).toBe(2);
    expect(navigatorGroundedStatusLineMatches(live)).toBe(true);
    expect(navigatorGroundedExportText(live).startsWith(navigatorGroundedExportHeader())).toBe(true);
    expect(parseNavigatorGroundedStatusLine('nope')).toBeNull();

    const dark = navigatorGrounded('dark');
    expect(isNavigatorGroundedOk(dark)).toBe(false);
    expect(navigatorGroundedStatusLine(dark)).toContain('reason=trade_plane_dark');
    expect(navigatorGroundedStatusLineMatches(dark)).toBe(true);
    expect(navigatorGroundedExportLine(dark)).toContain('refuse');
  });
});
