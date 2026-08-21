import { describe, expect, it } from 'vitest';
import { describeExecutionSpine, EXECUTION_SPINE_DOORS } from './oms-spine.js';

describe('describeExecutionSpine — execution.sor spine catalog', () => {
  it('lists OMS plan, arb scan, and MM doors', () => {
    const spine = describeExecutionSpine();
    expect(spine.externalOnly).toBe(true);
    expect(spine.houseInternalRefuse).toBe(true);
    expect(spine.doors.map((d) => d.id)).toEqual(EXECUTION_SPINE_DOORS.map((d) => d.id));
    expect(spine.doors.every((d) => d.inventsQuotes === false)).toBe(true);
  });

  it('execute door requires caller submit map', () => {
    const execute = describeExecutionSpine().doors.find((d) => d.id === 'execution.oms.execute');
    expect(execute?.callerSubmit).toBe(true);
    expect(execute?.module).toBe('execution.sor');
  });
});
