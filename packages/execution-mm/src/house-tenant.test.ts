import { describe, expect, it } from 'vitest';
import type { VenueKind } from '@intafaced/venue-adapter';
import { pinHouseTenantTarget, refuseHouseTenantInternalBook } from './house-tenant.js';

describe('pinHouseTenantTarget — D26-P0-01 Q1 EXTERNAL-ONLY', () => {
  it('refuses pointing the house tenant at our matching book', () => {
    const result = pinHouseTenantTarget({ venueId: 'matching', kind: 'internal' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('internal_matching_book');
    expect(result.kind).toBe('internal');
    expect(result.detail).toMatch(/EXTERNAL-ONLY/);
    expect(result.detail).toMatch(/matching book/);
  });

  it('refuses house-labelled internal venue the same way', () => {
    const result = pinHouseTenantTarget({ venueId: 'house', kind: 'internal' as VenueKind });
    expect(result).toMatchObject({ ok: false, reason: 'internal_matching_book' });
  });

  it('opens the door for an external CEX without inventing preference', () => {
    const result = pinHouseTenantTarget({ venueId: 'binance', kind: 'external-cex' });
    expect(result).toEqual({ ok: true, venueId: 'binance', kind: 'external-cex' });
  });

  it('opens the door for an external DEX without inventing preference', () => {
    const result = pinHouseTenantTarget({ venueId: 'uniswap', kind: 'external-dex' });
    expect(result).toEqual({ ok: true, venueId: 'uniswap', kind: 'external-dex' });
  });
});

describe('refuseHouseTenantInternalBook', () => {
  it('always blocks with honest matching-book reason (no success branch)', () => {
    const r = refuseHouseTenantInternalBook();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('internal_matching_book');
    expect(r.kind).toBe('internal');
  });
});
