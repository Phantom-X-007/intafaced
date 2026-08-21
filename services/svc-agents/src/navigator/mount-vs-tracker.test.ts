import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTING_TABLE } from '../gateway/routing.js';
import {
  NAVIGATOR_HONEST_GAPS,
  NAVIGATOR_MOUNTED_DOORS,
  NAVIGATOR_TRACKER_ID,
  navigatorDeclaredTasksMatchGuardrail,
  navigatorDoorsInRouterSource,
  navigatorMountMatrixComplete,
  navigatorMountVsTrackerBoardCard,
  navigatorTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

describe('navigator mount vs tracker honest gaps (D26-P1-A1)', () => {
  it('names tracker id and Class X gap codes', () => {
    expect(NAVIGATOR_TRACKER_ID).toBe('agents.navigator');
    expect(NAVIGATOR_HONEST_GAPS).toContain('gap.class_x_live_trade_inputs');
    expect(NAVIGATOR_HONEST_GAPS).toContain('gap.class_x_live_identity_session');
  });

  it('backend done bar met on tip — mount matrix + declared tasks', () => {
    expect(navigatorDeclaredTasksMatchGuardrail()).toBe(true);
    const tasks = DEFAULT_ROUTING_TABLE.routes.map((r) => r.task);
    expect(tasks).toContain('navigator.plan');
    expect(tasks).toContain('navigator.tool_select');
    expect(Array.from(navigatorDoorsInRouterSource()).sort()).toEqual(Array.from(NAVIGATOR_MOUNTED_DOORS).sort());
    expect(navigatorMountMatrixComplete()).toBe(true);
    expect(navigatorTrackerBackendDoneBarMet()).toBe(true);
    expect(navigatorMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
