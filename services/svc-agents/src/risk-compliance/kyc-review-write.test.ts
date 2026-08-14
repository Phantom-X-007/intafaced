import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { refuseIdentityKycReviewWrite } from './kyc-review-write.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('risk-compliance cannot write identity.kyc-review reviewed_by', () => {
  it('every write attempt is a typed refuse with writable:false', () => {
    const result = refuseIdentityKycReviewWrite({
      recordId: 'kyc-1',
      reviewerId: 'agent-risk',
      decision: 'approved',
    });
    expect(result).toEqual({
      status: 'refuse',
      reason: 'kyc_review_is_operator_only',
      kind: 'not_a_decision',
      isDecision: false,
      column: 'reviewed_by',
      writable: false,
      userMessageKey: 'agents.error.capability_unavailable',
    });
    expect(result).not.toHaveProperty('reviewedBy');
    expect(JSON.stringify(result)).not.toMatch(/"reviewed_by"\s*:\s*"/);
  });

  it('this module never assigns reviewed_by (source honesty)', () => {
    const writeSrc = readFileSync(join(here, 'kyc-review-write.ts'), 'utf8');
    const draftSrc = readFileSync(join(here, 'screening-draft.ts'), 'utf8');
    expect(writeSrc).not.toMatch(/reviewed_by\s*=/);
    expect(writeSrc).not.toMatch(/reviewedBy\s*:/);
    expect(draftSrc).not.toMatch(/reviewed_by\s*=/);
    expect(writeSrc).not.toMatch(/UPDATE\s+kyc/i);
    expect(writeSrc).toContain("writable: false");
  });
});
