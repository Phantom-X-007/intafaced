import { describe, expect, it } from 'vitest';
import { assessPerpListing } from './perp-listing-eligibility.js';

describe('perpetual listing eligibility', () => {
  const complete = {
    settle: 'fixture-settlement-asset',
    oracleSource: 'fixture-owner-oracle',
    leverageCap: '2.5',
  };

  it('admin/market proposal refuses closed without oracleSource', () => {
    expect(assessPerpListing({ ...complete, oracleSource: '' })).toEqual({
      orderable: false,
      code: 'market.oracle_source_unset',
      missing: ['oracleSource'],
    });
  });

  it.each([
    ['settle', { ...complete, settle: '' }, 'market.settlement_asset_unset'],
    ['leverageCap', { ...complete, leverageCap: '' }, 'market.leverage_cap_unset'],
  ] as const)('refuses closed without %s', (_field, proposal, code) => {
    expect(assessPerpListing(proposal)).toEqual({ orderable: false, code, missing: [_field] });
  });

  it('requires every field before becoming orderable', () => {
    expect(assessPerpListing(complete)).toEqual({ orderable: true, code: null, missing: [] });
  });

  it('refuses a numeric or non-positive leverage cap', () => {
    expect(assessPerpListing({ ...complete, leverageCap: 2.5 as never })).toEqual({
      orderable: false,
      code: 'market.leverage_cap_invalid',
      missing: [],
    });
    expect(assessPerpListing({ ...complete, leverageCap: '0' })).toEqual({
      orderable: false,
      code: 'market.leverage_cap_invalid',
      missing: [],
    });
    expect(assessPerpListing({ ...complete, leverageCap: '100000000000000000000' })).toEqual({
      orderable: false,
      code: 'market.leverage_cap_invalid',
      missing: [],
    });
  });
});
