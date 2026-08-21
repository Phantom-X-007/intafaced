import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertNoInventedRoutingScores,
  assertRoutingInputsPresent,
  assertRoutingScoresRefuseBlank,
  FORBIDDEN_ROUTING_SCORE_FIELDS,
  missingRoutingDimensions,
  readOperatorDeclaredSuccessRate,
  RoutingInputError,
  SUCCESS_RATE_SCALE,
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
    expect(() => assertNoInventedRoutingScores({ ...honest, geoScore: 1 })).toThrow(/geoScore/);
    expect(() => assertNoInventedRoutingScores({ ...honest, methodRank: 3 })).toThrow(/methodRank/);
  });

  it('refuses blank approval-rate and geo scores rather than inventing defaults', () => {
    try {
      assertRoutingScoresRefuseBlank({ approvalRate: '' });
      expect.unreachable('blank approvalRate must refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(RoutingInputError);
      const err = e as RoutingInputError;
      expect(err.code).toBe('pay.routing_input_missing');
      expect(err.missing).toEqual(['approvalRate']);
    }

    try {
      assertRoutingInputsPresent({ required: [] }, { geoScore: '  ' });
      expect.unreachable('blank geoScore must refuse');
    } catch (e) {
      const err = e as RoutingInputError;
      expect(err.code).toBe('pay.routing_input_missing');
      expect(err.missing).toEqual(['geoScore']);
    }

    try {
      assertRoutingInputsPresent({ required: [] }, { approvalRate: null, geoScore: Number.NaN });
      expect.unreachable('null/NaN scores must refuse');
    } catch (e) {
      const err = e as RoutingInputError;
      expect(err.missing).toEqual(['approvalRate', 'geoScore']);
    }

    expect(() => assertRoutingInputsPresent({ required: [] }, {})).not.toThrow();
    expect(() => assertRoutingInputsPresent({ required: [] }, { approvalRate: '0.81', geoScore: '12' })).not.toThrow();
  });

  it('refuses JS number scores — never treats a float as an honest rate', () => {
    try {
      assertRoutingScoresRefuseBlank({ approvalRate: 0.81 });
      expect.unreachable('number approvalRate must refuse');
    } catch (e) {
      expect((e as RoutingInputError).code).toBe('pay.routing_input_missing');
      expect((e as RoutingInputError).missing).toEqual(['approvalRate']);
    }
  });

  it('omitted score keys stay omitted — no default approval-rate sneaks in', () => {
    const inputs = { geoCountry: 'DE', method: 'card', riskBand: 'low' };
    expect(() => assertRoutingInputsPresent({ required: ['geo', 'method', 'risk'] }, inputs)).not.toThrow();
    expect(inputs).not.toHaveProperty('approvalRate');
    expect(inputs).not.toHaveProperty('geoScore');
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
      expect(src, f).not.toMatch(/\bapprovalRate\s*\?\?/);
      expect(src, f).not.toMatch(/\bgeoScore\s*\?\?/);
    }
    // List stays the ban-list source of truth for assertNoInventedRoutingScores.
    expect(FORBIDDEN_ROUTING_SCORE_FIELDS).toContain('approvalRate');
    expect(FORBIDDEN_ROUTING_SCORE_FIELDS).toContain('costBps');
    expect(FORBIDDEN_ROUTING_SCORE_FIELDS).toContain('geoScore');
    expect(FORBIDDEN_ROUTING_SCORE_FIELDS).toContain('methodRank');
  });
});

describe('readOperatorDeclaredSuccessRate — DIRECTION §8 never invent', () => {
  it('skips blank, zero, number, NaN, negative, and fractions above 1', () => {
    const unset = { ok: false as const, skip: 'approval-rate-unset' as const };
    expect(readOperatorDeclaredSuccessRate(undefined)).toEqual(unset);
    expect(readOperatorDeclaredSuccessRate(null)).toEqual(unset);
    expect(readOperatorDeclaredSuccessRate('')).toEqual(unset);
    expect(readOperatorDeclaredSuccessRate('   ')).toEqual(unset);
    expect(readOperatorDeclaredSuccessRate('0')).toEqual(unset);
    expect(readOperatorDeclaredSuccessRate('0.0')).toEqual(unset);
    expect(readOperatorDeclaredSuccessRate('0.000000000')).toEqual(unset);
    expect(readOperatorDeclaredSuccessRate(0.92)).toEqual(unset);
    expect(readOperatorDeclaredSuccessRate(Number.NaN)).toEqual(unset);
    expect(readOperatorDeclaredSuccessRate('-0.1')).toEqual(unset);
    expect(readOperatorDeclaredSuccessRate('1.01')).toEqual(unset);
    expect(readOperatorDeclaredSuccessRate('2')).toEqual(unset);
  });

  it('accepts operator-declared decimal strings in (0, 1]', () => {
    const mid = readOperatorDeclaredSuccessRate('0.81');
    expect(mid.ok).toBe(true);
    if (mid.ok) {
      expect(mid.declared).toBe('0.81');
      expect(mid.scaled).toBe(810_000_000n);
    }
    const full = readOperatorDeclaredSuccessRate('1');
    expect(full.ok).toBe(true);
    if (full.ok) expect(full.scaled).toBe(SUCCESS_RATE_SCALE);
  });
});
