import { describe, expect, it } from 'vitest';
import {
  arbCapitalComposeWired,
  arbOmsWireClosed,
  arbPlanLegsDoorWiredInExecution,
  arbReachableFromEdgeCompose,
  arbScanConsumerDoorOnEdge,
  arbScanDoorWiredInExecution,
} from './arb-oms-wire.js';

describe('execution.arbitrage fleet OMS + consumer wiring', () => {
  it('svc-execution arb scan + planLegs doors wired', () => {
    expect(arbScanDoorWiredInExecution()).toBe(true);
    expect(arbPlanLegsDoorWiredInExecution()).toBe(true);
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
});
