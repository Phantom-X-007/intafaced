import { describe, expect, it } from 'vitest';
import { reconcileLedger, SIMULATED_NOTICE } from './operator-commands';

/**
 * Reconcile stays a labelled stub until svc-edge mounts a real route.
 * Tightening this file's marker is allowed; inventing live numbers is not.
 */
describe('reconcileLedger — still simulated', () => {
  it('returns zeros with the permanent simulated marker', () => {
    const result = reconcileLedger();

    expect(result.intent.delivered).toBe(false);
    expect(result.simulated).toEqual({ ok: false, accountsChecked: 0, chainLength: 0, unbalancedAssets: [] });
    expect(result.simulatedNotice).toBe(SIMULATED_NOTICE);
    expect(result.simulatedNotice).toContain('Simulated');
    expect(result.simulatedNotice).toContain('no reconcile route');
  });
});
