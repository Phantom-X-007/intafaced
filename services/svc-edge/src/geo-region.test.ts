import { describe, expect, it } from 'vitest';
import { UNRESOLVED_REGION } from '@intafaced/config';
import { resolveRequestRegion, regionResolutionStatusLine } from './geo-region.js';

/**
 * Break: edge stamped one DEFAULT_REGION constant; geo header could be forged
 * without trustProxy; missing header could invent a "clear" region.
 * Done bar: trusted header only when trustProxy; absent → XX unresolved; never
 * invent list content.
 */

describe('resolveRequestRegion — default-only', () => {
  it('uses DEFAULT_REGION when no geo header is wired', () => {
    const r = resolveRequestRegion({ defaultRegion: 'DE', trustProxy: false });
    expect(r).toMatchObject({ region: 'DE', regionResolved: true, source: 'default', headerName: null });
  });

  it('marks XX as unresolved', () => {
    const r = resolveRequestRegion({ defaultRegion: 'XX', trustProxy: true });
    expect(r.region).toBe(UNRESOLVED_REGION);
    expect(r.regionResolved).toBe(false);
    expect(r.source).toBe('default');
  });
});

describe('resolveRequestRegion — trusted header', () => {
  it('ignores geo header when trustProxy is off (forge path closed)', () => {
    const r = resolveRequestRegion({
      defaultRegion: 'XX',
      trustProxy: false,
      geoHeaderName: 'cf-ipcountry',
      headers: { 'cf-ipcountry': 'US' },
    });
    expect(r.source).toBe('header_ignored_no_trust');
    expect(r.region).toBe('XX');
    expect(r.regionResolved).toBe(false);
    expect(r.note).toMatch(/EDGE_TRUST_PROXY/i);
  });

  it('reads trusted header when trustProxy is on', () => {
    const r = resolveRequestRegion({
      defaultRegion: 'XX',
      trustProxy: true,
      geoHeaderName: 'cf-ipcountry',
      headers: { 'cf-ipcountry': 'de' },
    });
    expect(r).toMatchObject({ region: 'DE', regionResolved: true, source: 'trusted_header' });
  });

  it('missing or invalid trusted header → unresolved XX (not invent clear)', () => {
    const missing = resolveRequestRegion({
      defaultRegion: 'US',
      trustProxy: true,
      geoHeaderName: 'cf-ipcountry',
      headers: {},
    });
    expect(missing.region).toBe(UNRESOLVED_REGION);
    expect(missing.regionResolved).toBe(false);
    expect(missing.source).toBe('unresolved');

    const junk = resolveRequestRegion({
      defaultRegion: 'US',
      trustProxy: true,
      geoHeaderName: 'cf-ipcountry',
      headers: { 'cf-ipcountry': 'USA' },
    });
    expect(junk.region).toBe(UNRESOLVED_REGION);
    expect(junk.regionResolved).toBe(false);

    // XX in the header is not a real country — unresolved
    const xx = resolveRequestRegion({
      defaultRegion: 'US',
      trustProxy: true,
      geoHeaderName: 'cf-ipcountry',
      headers: { 'cf-ipcountry': 'XX' },
    });
    expect(xx.region).toBe(UNRESOLVED_REGION);
    expect(xx.regionResolved).toBe(false);
  });

  it('header lookup is case-insensitive', () => {
    const r = resolveRequestRegion({
      defaultRegion: 'XX',
      trustProxy: true,
      geoHeaderName: 'CF-IPCountry',
      headers: { 'Cf-Ipcountry': 'fr' },
    });
    expect(r.region).toBe('FR');
    expect(r.source).toBe('trusted_header');
  });
});

describe('regionResolutionStatusLine', () => {
  it('never implies resolved when XX', () => {
    const line = regionResolutionStatusLine(resolveRequestRegion({ defaultRegion: 'XX', trustProxy: false }));
    expect(line).toBe('region=XX resolved=0 source=default');
  });
});
