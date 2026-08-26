import { describe, expect, it } from 'vitest';
import {
  arbCapitalComposeWired,
  arbOmsWireClosed,
  arbExecuteLegsDoorWiredInExecution,
  arbPlanLegsDoorWiredInExecution,
  arbReachableFromEdgeCompose,
  arbScanConsumerDoorOnEdge,
  arbScanDoorWiredInExecution,
  omsArbExecuteLegsFailedUnknownNotSuccess,
  omsArbPlanLegsDeclaredNonAtomic,
} from './arb-oms-wire.js';

describe('execution.arbitrage fleet OMS + consumer wiring', () => {
  it('svc-execution arb scan + planLegs + executeLegs doors wired', () => {
    expect(arbScanDoorWiredInExecution()).toBe(true);
    expect(arbPlanLegsDoorWiredInExecution()).toBe(true);
    expect(arbExecuteLegsDoorWiredInExecution()).toBe(true);
  });

  it('svc-edge reaches execution and mounts arb scan consumer door', () => {
    expect(arbReachableFromEdgeCompose()).toBe(true);
    expect(arbScanConsumerDoorOnEdge()).toBe(true);
  });

  it('owner maxQuoteAgeMs env passes through compose', () => {
    expect(arbCapitalComposeWired()).toBe(true);
  });

  it('closes capital_unset, no_oms_atomic_legs, and no_svc_consumer gaps', () => {
    expect(arbOmsWireClosed()).toBe(true);
  });

  it('OMS plan/execute keep failed and unknown legs from looking like group success', () => {
    expect(omsArbPlanLegsDeclaredNonAtomic()).toBe(true);
    expect(omsArbExecuteLegsFailedUnknownNotSuccess()).toBe(true);
  });
});
