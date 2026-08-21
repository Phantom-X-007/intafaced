import { describe, expect, it } from 'vitest';
import { assessPreListingRisk } from './pre-listing-assess.js';

describe('assessPreListingRisk', () => {
  it('refuses a clean badge request', () => {
    const result = assessPreListingRisk({ deployer: '0xabc', asBadge: true });
    expect(result.status).toBe('refuse');
    if (result.status !== 'refuse') return;
    expect(result.reason).toBe('badge_forbidden');
    expect(result.inventedCleanBadge).toBe(false);
  });

  it('refuses when reputation port is absent — not a low score', () => {
    const result = assessPreListingRisk({ deployer: '0xabc' });
    expect(result.status).toBe('refuse');
    if (result.status !== 'refuse') return;
    expect(result.reason).toBe('reputation_unread');
  });

  it('refuses empty deployer history instead of a clean badge', () => {
    const result = assessPreListingRisk({
      deployer: '0xabc',
      reputationPort: { facts: () => ({ lpLocks: 0, vestings: 0 }) },
    });
    expect(result.status).toBe('refuse');
    if (result.status !== 'refuse') return;
    expect(result.reason).toBe('history_absent');
  });

  it('returns pattern flags from raw counts — never a score', () => {
    const result = assessPreListingRisk({
      deployer: '0xAbC',
      reputationPort: { facts: () => ({ lpLocks: 1, vestings: 0 }) },
    });
    expect(result.status).toBe('annotation');
    if (result.status !== 'annotation') return;
    expect(result.deployer).toBe('0xabc');
    expect(result.lpLocks).toBe(1);
    expect(result.vestings).toBe(0);
    expect(result.patternFlags.map((f) => f.code)).toContain('no_vestings');
    expect(result.inventedCleanBadge).toBe(false);
  });
});
