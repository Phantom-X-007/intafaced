import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertNoInventedRoutingScores,
  assertRoutingInputsPresent,
  FORBIDDEN_ROUTING_SCORE_FIELDS,
  missingRoutingDimensions,
  RoutingInputError,
} from './routing-inputs.js';

/**
 * Unit card — pay.routing · wave 13 L02
 *
 * 1. Promise: SPEC-PAY-VERTICALS §5 + paste Done bar — geo/method/risk refuse
 *    when data missing; never invent approval % (DIRECTION §8).
 * 2. Reachable break on tip: no module refused blank smart-routing inputs.
 * 3. Done bar: required dim blank → `pay.routing_input_missing`; score fields banned.
 * 4. Class N (no money move).
 * 5. Paths: services/svc-pay/src/routing-inputs.ts (+ test) — not Denon-open files.
 * 6. RED first: these cases fail until module exists.
 * 7. Collision: clear of #1625/#1627 (payment-service/public-rest/index).
 */

const here = dirname(fileURLToPath(import.meta.url));

describe('pay.routing — refuse when geo/method/risk data missing', () => {
  it('preference-only policy (required=[]) never demands inputs', () => {
    expect(() => assertRoutingInputsPresent({ required: [] }, {})).not.toThrow();
    expect(missingRoutingDimensions({ required: [] }, {})).toEqual([]);
  });

  it('refuses missing geo when geo is required', () => {
    expect(() => assertRoutingInputsPresent({ required: ['geo'] }, { method: 'card', riskBand: 'low' })).toThrow(RoutingInputError);

    try {
      assertRoutingInputsPresent({ required: ['geo'] }, { geoCountry: '  ', method: 'card' });
      expect.unreachable('blank geo must refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(RoutingInputError);
      const err = e as RoutingInputError;
      expect(err.code).toBe('pay.routing_input_missing');
      expect(err.missing).toEqual(['geo']);
    }
  });

  it('refuses missing method when method is required', () => {
    try {
      assertRoutingInputsPresent({ required: ['method'] }, { geoCountry: 'DE' });
      expect.unreachable('missing method must refuse');
    } catch (e) {
      const err = e as RoutingInputError;
      expect(err.code).toBe('pay.routing_input_missing');
      expect(err.missing).toEqual(['method']);
    }
  });

  it('refuses missing risk when risk is required — never invents a band', () => {
    try {
      assertRoutingInputsPresent({ required: ['risk'] }, { geoCountry: 'US', method: 'card' });
      expect.unreachable('missing risk must refuse');
    } catch (e) {
      const err = e as RoutingInputError;
      expect(err.code).toBe('pay.routing_input_missing');
      expect(err.missing).toEqual(['risk']);
    }
  });

  it('lists every missing dimension at once', () => {
    const missing = missingRoutingDimensions(
      { required: ['geo', 'method', 'risk'] },
      { geoCountry: null, method: undefined, riskBand: '' },
    );
    expect(missing).toEqual(['geo', 'method', 'risk']);
  });

  it('passes when all required dimensions are present', () => {
    expect(() =>
      assertRoutingInputsPresent({ required: ['geo', 'method', 'risk'] }, { geoCountry: 'GB', method: 'crypto', riskBand: 'external:ok' }),
    ).not.toThrow();
  });

  it('does not invent approval rates or cost weights on a decision object', () => {
    const honest = { chosen: 'crypto-native', considered: [{ railId: 'crypto-native', outcome: 'chosen' }] };
    expect(() => assertNoInventedRoutingScores(honest)).not.toThrow();

    expect(() => assertNoInventedRoutingScores({ ...honest, approvalRate: 0.92 })).toThrow(/approvalRate/);
    expect(() => assertNoInventedRoutingScores({ ...honest, costBps: 25 })).toThrow(/costBps/);
  });

  it('source tree still bans inventable score field assignments in routing modules', () => {
    const files = ['routing-inputs.ts', 'rails/posture.ts', 'sandbox-key-routing.ts', 'routing/decide.ts'];
    for (const f of files) {
      const src = readFileSync(join(here, f), 'utf8');
      // No property assignment / object field definition of inventable scores.
      expect(src, f).not.toMatch(/\bapprovalRate\s*:/);
      expect(src, f).not.toMatch(/\bapproval_rate\s*:/);
      expect(src, f).not.toMatch(/\bcostBps\s*:/);
      expect(src, f).not.toMatch(/\bcost_bps\s*:/);
      expect(src, f).not.toMatch(/\bapprovalRate\s*=/);
      expect(src, f).not.toMatch(/\bcostBps\s*=/);
    }
    // List stays the ban-list source of truth for assertNoInventedRoutingScores.
    expect(FORBIDDEN_ROUTING_SCORE_FIELDS).toContain('approvalRate');
    expect(FORBIDDEN_ROUTING_SCORE_FIELDS).toContain('costBps');
  });
});
