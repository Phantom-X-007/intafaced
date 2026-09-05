import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadMatchingVenueHalt,
  matchingVenueHaltRefuse,
  optionalVenueHalted,
  readMatchingUrl,
  resolveMatchingVenueHalt,
} from './oms-matching-venue-halt.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('optionalVenueHalted', () => {
  it('reads boolean venueHalted; never invents a halt', () => {
    expect(optionalVenueHalted({ venueHalted: true })).toBe(true);
    expect(optionalVenueHalted({ venueHalted: false })).toBe(false);
    expect(optionalVenueHalted({ venue_halted: true })).toBe(true);
    expect(optionalVenueHalted({ markets: ['BTC-USDT'], halted: ['BTC-USDT'] })).toBeUndefined();
    expect(optionalVenueHalted({ ok: true, service: 'svc-matching' })).toBeUndefined();
    expect(optionalVenueHalted({ venueHalted: 'true' })).toBeUndefined();
    expect(optionalVenueHalted(null)).toBeUndefined();
  });
});

describe('matchingVenueHaltRefuse', () => {
  it('true refuses halt-all; false proceeds; missing refuses live', () => {
    expect(matchingVenueHaltRefuse({ venueHalted: true })).toMatchObject({ ok: false, reason: 'venue_halted' });
    expect(matchingVenueHaltRefuse({ venueHalted: false })).toBeNull();
    expect(matchingVenueHaltRefuse(undefined)).toMatchObject({ ok: false, reason: 'venue_halt_unavailable' });
    expect(matchingVenueHaltRefuse(null)).toMatchObject({ ok: false, reason: 'venue_halt_unavailable' });
  });
});

describe('readMatchingUrl', () => {
  it('trims; empty is missing — does not invent localhost', () => {
    expect(readMatchingUrl('http://matching.test/')).toBe('http://matching.test');
    expect(readMatchingUrl('  ')).toBeNull();
    expect(readMatchingUrl(undefined)).toBeNull();
  });
});

describe('loadMatchingVenueHalt', () => {
  it('open proceeds; halt-all is true; missing source is undefined', async () => {
    await expect(
      loadMatchingVenueHalt({
        matchingUrl: 'http://matching.test',
        fetch: async () =>
          new Response(JSON.stringify({ markets: ['BTC-USDT'], venueHalted: false }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      }),
    ).resolves.toEqual({ venueHalted: false });

    await expect(
      loadMatchingVenueHalt({
        matchingUrl: 'http://matching.test',
        fetch: async () =>
          new Response(JSON.stringify({ markets: ['BTC-USDT'], venueHalted: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      }),
    ).resolves.toEqual({ venueHalted: true });

    await expect(loadMatchingVenueHalt({})).resolves.toBeUndefined();
    await expect(loadMatchingVenueHalt({ matchingUrl: '   ' })).resolves.toBeUndefined();
    await expect(
      loadMatchingVenueHalt({
        matchingUrl: 'http://matching.test',
        fetch: async () => new Response('nope', { status: 200 }),
      }),
    ).resolves.toBeUndefined();
    await expect(
      loadMatchingVenueHalt({
        matchingUrl: 'http://matching.test',
        fetch: async () =>
          new Response(JSON.stringify({ ok: true, service: 'svc-matching' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      }),
    ).resolves.toBeUndefined();
  });

  it('GET /markets only — never POST /halt-all, never invents an operator', async () => {
    const seen: string[] = [];
    await loadMatchingVenueHalt({
      matchingUrl: 'http://matching.test',
      fetch: async (input, init) => {
        seen.push(`${init?.method ?? 'GET'} ${String(input)}`);
        return new Response(JSON.stringify({ venueHalted: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    expect(seen).toEqual(['GET http://matching.test/markets']);
    expect(seen.join(' ')).not.toMatch(/halt-all|operator/i);
  });
});

describe('resolveMatchingVenueHalt', () => {
  it('passes a snapshot through; loader null is missing', async () => {
    await expect(resolveMatchingVenueHalt({ venueHalted: false })).resolves.toEqual({ venueHalted: false });
    await expect(resolveMatchingVenueHalt(undefined)).resolves.toBeUndefined();
    await expect(resolveMatchingVenueHalt(async () => null)).resolves.toBeUndefined();
  });
});

describe('MATCHING_URL env is the halt source, never invented', () => {
  it('env declares MATCHING_URL optional; blank is absent', () => {
    const envSrc = readFileSync(join(here, 'env.ts'), 'utf8');
    expect(envSrc).toMatch(/MATCHING_URL:/);
    expect(envSrc).not.toMatch(/MATCHING_URL:[\s\S]{0,80}\.default\(/);
    expect(envSrc).not.toMatch(/localhost:4005/);
  });

  it('index loads GET /markets from MATCHING_URL, never POST /halt-all', () => {
    const indexSrc = readFileSync(join(here, 'index.ts'), 'utf8');
    expect(indexSrc).toMatch(/loadMatchingVenueHalt/);
    expect(indexSrc).toMatch(/env\.MATCHING_URL/);
    expect(indexSrc).not.toMatch(/halt-all/);
    expect(indexSrc).toMatch(/INTERNAL_SERVICE_SECRET/);
  });
});
