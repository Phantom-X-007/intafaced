import { describe, expect, it } from 'vitest';
import { COACH_REFUSE_COPY } from './grounded-session.js';
import { COACH_REFUSE_REASONS, describeCoachPolicy } from './policy.js';

describe('describeCoachPolicy', () => {
  it('states coach honesty without inventing library or positions', () => {
    const p = describeCoachPolicy();
    expect(p.notAdvice).toBe(true);
    expect(p.refuseReasons).toEqual(COACH_REFUSE_REASONS);
    expect(p.userMessageKey).toBe(COACH_REFUSE_COPY);
    expect(p.inventsLibraryTitles).toBe(false);
    expect(p.inventsPositions).toBe(false);
  });
});
