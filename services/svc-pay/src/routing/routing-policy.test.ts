import { describe, expect, it } from 'vitest';
import { FORBIDDEN_ROUTING_SCORE_FIELDS } from '../routing-inputs.js';
import { ROUTING_REQUIRED_DIMENSIONS, describeRoutingPolicy } from './routing-policy.js';

describe('describeRoutingPolicy', () => {
  it('states smart routing honesty without inventing scores', () => {
    const p = describeRoutingPolicy();
    expect(p.requiredDimensions).toEqual(ROUTING_REQUIRED_DIMENSIONS);
    expect(p.forbiddenInventedScoreFields).toEqual([...FORBIDDEN_ROUTING_SCORE_FIELDS]);
    expect(p.inventsApprovalRates).toBe(false);
    expect(p.inventsCostWeights).toBe(false);
    expect(p.movesMoney).toBe(false);
    expect(p.blankDimensionRefuseClosed).toBe(true);
  });
});
