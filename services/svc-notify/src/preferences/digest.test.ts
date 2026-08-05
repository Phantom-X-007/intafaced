import { describe, expect, it } from 'vitest';
import {
  assertMayDigest,
  DEFAULT_DIGEST_PREFS,
  DigestError,
  digestWindowMs,
  isDigestFlushDue,
  isDigestHolding,
  mayEnterDigest,
  MemoryDigestStore,
  shouldSendImmediate,
  applyDigestCadence,
  holdingDigestCadences,
  allDigestCadences,
  isDigestOff,
  isDigestDaily,
  isDigestHourly,
  digestWindowMsLabel,
  digestBoardCard,
  digestExportLine,
  digestExportHeader,
  digestExportText,
  parseDigestExportLine,
} from './digest.js';

describe('notify L3 digest cadence (non-critical only)', () => {
  it('defaults off → everything immediate', () => {
    expect(shouldSendImmediate(DEFAULT_DIGEST_PREFS, 'info')).toBe(true);
    expect(shouldSendImmediate(DEFAULT_DIGEST_PREFS, 'critical')).toBe(true);
  });

  it('hourly holds info/action; critical always immediate', () => {
    const hourly = applyDigestCadence(DEFAULT_DIGEST_PREFS, 'hourly');
    expect(shouldSendImmediate(hourly, 'info')).toBe(false);
    expect(shouldSendImmediate(hourly, 'action')).toBe(false);
    expect(shouldSendImmediate(hourly, 'critical')).toBe(true);
  });

  it('critical cannot enter digest', () => {
    expect(mayEnterDigest('critical')).toBe(false);
    expect(mayEnterDigest('info')).toBe(true);
    expect(() => assertMayDigest('critical')).toThrow(DigestError);
  });

  it('refuses invalid cadence', () => {
    expect(() => applyDigestCadence(DEFAULT_DIGEST_PREFS, 'weekly')).toThrow(DigestError);
  });

  it('digest windows are fixed durations', () => {
    expect(digestWindowMs('off')).toBe(0);
    expect(digestWindowMs('hourly')).toBe(3_600_000);
    expect(digestWindowMs('daily')).toBe(86_400_000);
  });

  it('flush due respects lastFlushAt + cadence', () => {
    const t0 = new Date('2026-08-05T12:00:00.000Z');
    expect(isDigestFlushDue({ cadence: 'off', lastFlushAt: null, now: t0 })).toBe(false);
    expect(isDigestFlushDue({ cadence: 'hourly', lastFlushAt: null, now: t0 })).toBe(true);
    expect(
      isDigestFlushDue({
        cadence: 'hourly',
        lastFlushAt: t0,
        now: new Date('2026-08-05T12:30:00.000Z'),
      }),
    ).toBe(false);
    expect(
      isDigestFlushDue({
        cadence: 'hourly',
        lastFlushAt: t0,
        now: new Date('2026-08-05T13:00:00.000Z'),
      }),
    ).toBe(true);
  });

  it('MemoryDigestStore set/get', () => {
    const store = new MemoryDigestStore();
    expect(store.get('u1').cadence).toBe('off');
    expect(store.setCadence('u1', 'daily').cadence).toBe('daily');
    expect(store.get('u1').cadence).toBe('daily');
  });

  it('L3 isDigestHolding is false for off', () => {
    expect(isDigestHolding('off')).toBe(false);
    expect(isDigestHolding('hourly')).toBe(true);
  });

  it('L3 holdingDigestCadences excludes off', () => {
    expect(holdingDigestCadences()).toEqual(['hourly', 'daily']);
    expect(holdingDigestCadences()).not.toContain('off');
  });

  it('L3 wave35 cadence helpers + window label', () => {
    expect(allDigestCadences()).toEqual(['off', 'hourly', 'daily']);
    expect(isDigestOff('off')).toBe(true);
    expect(isDigestHourly('hourly')).toBe(true);
    expect(isDigestDaily('daily')).toBe(true);
    expect(digestWindowMsLabel('off')).toBe('0');
    expect(digestWindowMsLabel('hourly')).toBe('3600000');
  });

  it('L3 wave43 digest board + export/parse', () => {
    expect(digestBoardCard(DEFAULT_DIGEST_PREFS).off).toBe(true);
    expect(digestExportHeader()).toBe('cadence,windowMs');
    expect(digestExportLine(DEFAULT_DIGEST_PREFS)).toBe('off,0');
    expect(parseDigestExportLine('hourly,3600000')).toEqual({ cadence: 'hourly', windowMs: 3600000 });
    expect(parseDigestExportLine('cadence,windowMs')).toBeNull();
    const hourly = applyDigestCadence(DEFAULT_DIGEST_PREFS, 'hourly');
    expect(digestBoardCard(hourly).hourly).toBe(true);
    expect(digestExportText(hourly)).toContain('hourly');
  });
});
