import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FEE_SCHEDULE_RESIDUAL,
  FeeScheduleError,
  parseFeeScheduleJson,
  previewFeeBps,
  TRADE_FEE_SCHEDULE_ENV,
  UNPUBLISHED_FEE_SCHEDULE,
} from './fee-schedule.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const here = dirname(fileURLToPath(import.meta.url));

const PUBLISHED = JSON.stringify({
  published: true,
  version: 'ptx-m21-test',
  makerBps: '10',
  takerBps: '20',
});

describe('parseFeeScheduleJson', () => {
  it('empty env → unpublished (never invents bps)', () => {
    expect(parseFeeScheduleJson('')).toEqual(UNPUBLISHED_FEE_SCHEDULE);
    expect(parseFeeScheduleJson(null)).toEqual(UNPUBLISHED_FEE_SCHEDULE);
    expect(parseFeeScheduleJson('  ')).toEqual(UNPUBLISHED_FEE_SCHEDULE);
    expect(parseFeeScheduleJson(undefined)).toEqual(UNPUBLISHED_FEE_SCHEDULE);
  });

  it('published false → unpublished', () => {
    expect(parseFeeScheduleJson('{"published":false}')).toEqual(UNPUBLISHED_FEE_SCHEDULE);
  });

  it('published true with decimal-string bps', () => {
    const schedule = parseFeeScheduleJson(PUBLISHED);
    expect(schedule).toEqual({
      published: true,
      version: 'ptx-m21-test',
      makerBps: 10,
      takerBps: 20,
      makerRebateBps: null,
    });
  });

  it('explicit zero rebate is owner-set, not invented', () => {
    const schedule = parseFeeScheduleJson(
      JSON.stringify({
        published: true,
        version: 'v1',
        makerBps: '0',
        takerBps: '0',
        makerRebateBps: '0',
      }),
    );
    expect(schedule.published).toBe(true);
    if (schedule.published) expect(schedule.makerRebateBps).toBe(0);
  });

  it('refuses JSON numbers for bps — decimal strings only', () => {
    const raw = JSON.stringify({ published: true, version: 'v1', makerBps: 10, takerBps: 20 });
    expect(() => parseFeeScheduleJson(raw)).toThrow(FeeScheduleError);
    try {
      parseFeeScheduleJson(raw);
    } catch (err) {
      expect(err).toBeInstanceOf(FeeScheduleError);
      expect((err as FeeScheduleError).code).toBe('trade.fee_schedule_blank');
      expect((err as FeeScheduleError).residual).toBe(FEE_SCHEDULE_RESIDUAL);
    }
  });

  it('refuses blank / missing / non-integer / out-of-range bps', () => {
    const bases = { published: true, version: 'v1', takerBps: '20' };
    for (const makerBps of [undefined, null, '', '10.5', '-1', '10000', '01a']) {
      expect(() => parseFeeScheduleJson(JSON.stringify({ ...bases, makerBps }))).toThrow(FeeScheduleError);
    }
  });

  it('refuses invalid JSON instead of inventing a schedule', () => {
    expect(() => parseFeeScheduleJson('{')).toThrow(FeeScheduleError);
    expect(() => parseFeeScheduleJson('[]')).toThrow(FeeScheduleError);
    expect(() => parseFeeScheduleJson('"nope"')).toThrow(FeeScheduleError);
  });

  it('refuses published without a version', () => {
    expect(() => parseFeeScheduleJson(JSON.stringify({ published: true, makerBps: '10', takerBps: '20' }))).toThrow(FeeScheduleError);
  });
});

describe('previewFeeBps', () => {
  it('unpublished → null (preview must refuse, not invent listing bps)', () => {
    expect(previewFeeBps(UNPUBLISHED_FEE_SCHEDULE, 'taker')).toBeNull();
    expect(previewFeeBps(UNPUBLISHED_FEE_SCHEDULE, 'maker')).toBeNull();
  });

  it('published → owner maker/taker counts', () => {
    const schedule = parseFeeScheduleJson(PUBLISHED);
    expect(previewFeeBps(schedule, 'maker')).toBe(10);
    expect(previewFeeBps(schedule, 'taker')).toBe(20);
  });
});

describe('TRADE_FEE_SCHEDULE wiring', () => {
  it('compose passes the owner schedule through with no default magnitude', () => {
    const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
    expect(compose).toMatch(/TRADE_FEE_SCHEDULE:\s*\$\{TRADE_FEE_SCHEDULE:-\}/);
    expect(compose).not.toMatch(/TRADE_FEE_SCHEDULE:\s*\$\{TRADE_FEE_SCHEDULE:-[^}]+\}/);
  });

  it('env.ts defaults blank (unpublished)', () => {
    const envTs = readFileSync(join(ROOT, 'services/svc-trade/src/env.ts'), 'utf8');
    expect(envTs).toMatch(/TRADE_FEE_SCHEDULE:\s*z\.string\(\)\.default\(''\)/);
  });

  it('index hitch parses env and passes feeSchedule into the preview door', () => {
    const index = readFileSync(join(ROOT, 'services/svc-trade/src/index.ts'), 'utf8');
    expect(index).toMatch(/parseFeeScheduleJson\(env\.TRADE_FEE_SCHEDULE\)/);
    expect(index).toMatch(/registerSpotOrderPreviewRest\(app, \{[\s\S]*feeSchedule/);
  });

  it('does not recut router.ts', () => {
    const router = readFileSync(join(here, '..', 'router.ts'), 'utf8');
    expect(router).not.toMatch(/TRADE_FEE_SCHEDULE|parseFeeScheduleJson|fee-schedule/);
  });

  it('names the env key constantly', () => {
    expect(TRADE_FEE_SCHEDULE_ENV).toBe('TRADE_FEE_SCHEDULE');
  });
});
