import { describe, expect, it } from 'vitest';
import { bpsForLatencyGrade, EXECUTION_SOR_LETTER_BPS_SCHEDULE_ENV, letterBpsScheduleGate } from './letter-to-bps-schedule.js';

const SAMPLE = JSON.stringify({ A: 0, B: 5, C: 12, D: 25, F: 50 });

describe('letter→bps owner schedule gate', () => {
  it('refuses when env is unset', () => {
    expect(letterBpsScheduleGate({})).toEqual({
      configured: false,
      reason: 'schedule_unset',
      detail: `${EXECUTION_SOR_LETTER_BPS_SCHEDULE_ENV} is unset`,
    });
  });

  it('parses owner JSON schedule without inventing defaults', () => {
    const gate = letterBpsScheduleGate({ [EXECUTION_SOR_LETTER_BPS_SCHEDULE_ENV]: SAMPLE });
    expect(gate.configured).toBe(true);
    if (!gate.configured) throw new Error('expected configured schedule');
    expect(gate.schedule).toEqual({ A: 0, B: 5, C: 12, D: 25, F: 50 });
  });

  it('refuses incomplete schedules', () => {
    const gate = letterBpsScheduleGate({ [EXECUTION_SOR_LETTER_BPS_SCHEDULE_ENV]: JSON.stringify({ A: 0, B: 1 }) });
    expect(gate).toMatchObject({ configured: false, reason: 'schedule_incomplete' });
  });

  it('maps graded latency letters to owner bps magnitudes', () => {
    const gate = letterBpsScheduleGate({ [EXECUTION_SOR_LETTER_BPS_SCHEDULE_ENV]: SAMPLE });
    if (!gate.configured) throw new Error('expected configured schedule');
    expect(bpsForLatencyGrade(gate.schedule, { grade: 'B' })).toEqual({ ok: true, bps: 5 });
    expect(bpsForLatencyGrade(gate.schedule, { grade: null })).toEqual({ ok: false, reason: 'letter_unmapped' });
  });
});
