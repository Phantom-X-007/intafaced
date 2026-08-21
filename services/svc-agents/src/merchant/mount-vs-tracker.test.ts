import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTING_TABLE } from '../gateway/routing.js';
import {
  MERCHANT_BLOCKER_TRACKER_ID,
  MERCHANT_HONEST_GAPS,
  MERCHANT_MOUNTED_DOORS,
  MERCHANT_TRACKER_ID,
  merchantDeclaredTaskMatchesGuardrail,
  merchantDoorsInRouterSource,
  merchantMountMatrixComplete,
  merchantMountVsTrackerBoardCard,
  merchantTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

describe('merchant mount vs tracker honest gaps (D26-P1-A4)', () => {
  it('names tracker, blocker, and Class X gap codes', () => {
    expect(MERCHANT_TRACKER_ID).toBe('agents.merchant');
    expect(MERCHANT_BLOCKER_TRACKER_ID).toBe('pay.routing');
    expect(MERCHANT_HONEST_GAPS).toContain('gap.class_x_live_pay_metrics_env');
  });

  it('backend done bar met on tip — mount matrix + merchant.watch task', () => {
    expect(merchantDeclaredTaskMatchesGuardrail()).toBe(true);
    expect(DEFAULT_ROUTING_TABLE.routes.map((r) => r.task)).toContain('merchant.watch');
    expect(merchantDoorsInRouterSource().sort()).toEqual([...MERCHANT_MOUNTED_DOORS].sort());
    expect(merchantMountMatrixComplete()).toBe(true);
    expect(merchantTrackerBackendDoneBarMet()).toBe(true);
    expect(merchantMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
