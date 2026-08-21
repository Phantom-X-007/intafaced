import { describe, expect, it } from 'vitest';
import {
  KB_MOUNTED_DOORS,
  OPS_KB_WORKFLOW_TRACKER_ID,
  kbDoorsInRouterSource,
  opsKbWorkflowMountVsTrackerBoardCard,
  opsKbWorkflowTrackerBackendDoneBarMet,
} from './kb-workflow-mount-vs-tracker.js';

describe('ops.kb-workflow mount vs tracker honest gaps (D26-P1-O4)', () => {
  it('backend done bar met on tip — KB catalog only, no second agent runtime', () => {
    expect(OPS_KB_WORKFLOW_TRACKER_ID).toBe('ops.kb-workflow');
    expect([...kbDoorsInRouterSource()].slice().sort()).toEqual([...KB_MOUNTED_DOORS].slice().sort());
    expect(opsKbWorkflowTrackerBackendDoneBarMet()).toBe(true);
    expect(opsKbWorkflowMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
