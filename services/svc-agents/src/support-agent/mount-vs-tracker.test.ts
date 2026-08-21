import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTING_TABLE } from '../gateway/routing.js';
import {
  SUPPORT_DESK_TRACKER_ID,
  SUPPORT_MOUNTED_DOORS,
  SUPPORT_TRACKER_ID,
  supportDeclaredTasksMatchGuardrail,
  supportDoorsInRouterSource,
  supportMountMatrixComplete,
  supportMountVsTrackerBoardCard,
  supportTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

describe('support-agent mount vs tracker honest gaps (D26-P1-A2)', () => {
  it('names tracker ids and backend done bar met on tip', () => {
    expect(SUPPORT_TRACKER_ID).toBe('agents.support');
    expect(SUPPORT_DESK_TRACKER_ID).toBe('ops.support');
    expect(supportDeclaredTasksMatchGuardrail()).toBe(true);
    expect(Array.from(supportDoorsInRouterSource()).sort()).toEqual(Array.from(SUPPORT_MOUNTED_DOORS).sort());
    expect(supportMountMatrixComplete()).toBe(true);
    expect(supportTrackerBackendDoneBarMet()).toBe(true);
    expect(supportMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });

  it('routing table carries support tasks', () => {
    const tasks = DEFAULT_ROUTING_TABLE.routes.map((r) => r.task);
    expect(tasks).toContain('support.classify');
    expect(tasks).toContain('support.reply');
  });
});
