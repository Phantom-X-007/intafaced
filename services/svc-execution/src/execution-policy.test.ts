import { describe, expect, it } from 'vitest';
import { EXECUTION_SPINE_DOORS, describeExecutionPolicy } from './execution-policy.js';

describe('describeExecutionPolicy', () => {
  it('mirrors execution spine catalog without inventing quotes', () => {
    const p = describeExecutionPolicy();
    expect(p.doors).toEqual(EXECUTION_SPINE_DOORS);
    expect(p.externalOnly).toBe(true);
    expect(p.houseInternalRefuse).toBe(true);
    expect(p.sorUsesVenueAdapterPlanRoute).toBe(true);
    expect(p.doors.every((d) => d.inventsQuotes === false)).toBe(true);
  });
});
