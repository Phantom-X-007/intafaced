import { describe, expect, it } from 'vitest';
import { KB_CATALOG_REFUSE_CODES, KB_KEY_PREFIX, describeKbPolicy } from './kb-policy.js';
import { looksLikeSlaPromise } from './sla-honesty.js';

describe('describeKbPolicy — ops.kb-workflow honesty door', () => {
  it('summarizes platform KB spine without echoing article bodies', () => {
    const p = describeKbPolicy();
    expect(p.spineArticleCount).toBeGreaterThan(0);
    expect(p.spineIds.length).toBe(p.spineArticleCount);
    expect(p.keyPrefix).toBe(KB_KEY_PREFIX);
    expect(p.keysUnderSupportKb).toBe(true);
    expect(p.vendorNamesForbidden).toBe(true);
    expect(p.slaTimingsForbidden).toBe(true);
    expect(p.inventsRefundAmounts).toBe(false);
    expect(p.refuseCodes).toEqual(KB_CATALOG_REFUSE_CODES);
    expect(p.platformSpineSize).toBeGreaterThanOrEqual(p.spineArticleCount);
    expect(JSON.stringify(p)).not.toMatch(/binance|coinbase|kraken/i);
    expect(looksLikeSlaPromise(p)).toBe(false);
  });
});
