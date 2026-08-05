import { describe, expect, it } from 'vitest';
import { navigatorGrounded } from './grounded.js';

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
