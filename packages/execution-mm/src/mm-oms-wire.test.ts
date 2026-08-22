import { describe, expect, it } from 'vitest';
import { mmOmsDoorsWiredInExecution, mmOmsReachableFromEdgeCompose, mmOmsWireClosed } from './mm-oms-wire.js';

describe('execution.market-making OMS wire', () => {
  it('svc-execution exposes mm.quote and mm.hedge doors on the OMS spine', () => {
    expect(mmOmsDoorsWiredInExecution()).toBe(true);
  });

  it('svc-edge compose reaches svc-execution for MM callers', () => {
    expect(mmOmsReachableFromEdgeCompose()).toBe(true);
  });

  it('closes gap.no_oms_wire', () => {
    expect(mmOmsWireClosed()).toBe(true);
  });
});
