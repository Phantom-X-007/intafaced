import { describe, expect, it } from 'vitest';
import { healthFromGrade, LatencyGradeRegistry, VenueLatencyGrader } from './latency.js';
import { isRoutable } from '../source.js';

const T0 = new Date('2026-07-30T12:00:00Z');
const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);

function feed(
  grader: VenueLatencyGrader,
  count: number,
  roundTripMs: number,
  outcome: 'ok' | 'reject' | 'error' = 'ok',
  startAt = 0,
): void {
  for (let i = 0; i < count; i += 1) grader.observe({ roundTripMs, outcome, at: at(startAt + i) });
}

describe('VenueLatencyGrader', () => {
  it('grades an unmeasured venue F, not A — no bad news is not evidence', () => {
    const grade = new VenueLatencyGrader('v').grade(T0);
    expect(grade.grade).toBe('F');
    expect(grade.samples).toBe(0);
    expect(grade.p95Ms).toBeNull();
    expect(grade.provisional).toBe(true);
    expect(grade.reasons[0]).toContain('never graded, not graded good');
  });

  it('grades a fast, clean venue A', () => {
    const grader = new VenueLatencyGrader('v');
    feed(grader, 20, 40);
    const grade = grader.grade(at(100));
    expect(grade.grade).toBe('A');
    expect(grade.p50Ms).toBe(40);
    expect(grade.p95Ms).toBe(40);
    expect(grade.provisional).toBe(false);
    expect(grade.reasons).toEqual([]);
  });

  it('grades on the p95 TAIL, not the mean — the tail is what an order experiences', () => {
    const grader = new VenueLatencyGrader('v');
    // 90 fast reads and 10 four-second ones. Mean ≈ 418ms (a C); p95 is 4000ms.
    feed(grader, 90, 20, 'ok', 0);
    feed(grader, 10, 4_000, 'ok', 90);

    const grade = grader.grade(at(200));
    expect(grade.p50Ms).toBe(20);
    expect(grade.p95Ms).toBe(4_000);
    expect(grade.grade).toBe('F');
    expect(grade.reasons.join(' ')).toContain('p95 round-trip 4000ms');
  });

  it('takes the WORSE of the signals — a venue is as good as its weakest', () => {
    const grader = new VenueLatencyGrader('v');
    // Fast (A on latency) and refusing a fifth of everything (D on rejects).
    feed(grader, 80, 30, 'ok', 0);
    feed(grader, 20, 30, 'reject', 80);

    const grade = grader.grade(at(200));
    expect(grade.rejectRateBps).toBe(2_000);
    expect(grade.grade).toBe('D');
    expect(grade.reasons.join(' ')).toContain('reject rate 20.00%');
  });

  it('grades a venue that answers fast and never succeeds F', () => {
    const grader = new VenueLatencyGrader('v');
    feed(grader, 20, 5, 'error');
    const grade = grader.grade(at(100));
    expect(grade.p95Ms).toBeNull();
    expect(grade.grade).toBe('F');
    expect(grade.reasons.join(' ')).toContain('no successful observation');
  });

  it('grades a venue that has gone quiet F, however fast it used to be', () => {
    const grader = new VenueLatencyGrader('v');
    feed(grader, 20, 10);
    // Well inside the 60s window, well past the 5s staleness ceiling.
    const grade = grader.grade(at(30_000));
    expect(grade.staleMs).toBe(29_981);
    expect(grade.grade).toBe('F');
    expect(grade.reasons.join(' ')).toContain('ceiling 5000ms');
  });

  it('marks a grade built on too few samples provisional', () => {
    const grader = new VenueLatencyGrader('v');
    feed(grader, 2, 10);
    const grade = grader.grade(at(50));
    expect(grade.samples).toBe(2);
    expect(grade.provisional).toBe(true);
  });

  it('evicts by age, so a venue cannot coast on a grade earned an hour ago', () => {
    const grader = new VenueLatencyGrader('v', { maxAgeMs: 1_000 });
    feed(grader, 20, 10, 'ok', 0);
    expect(grader.grade(at(500)).samples).toBe(20);
    expect(grader.grade(at(5_000)).samples).toBe(0);
  });

  it('evicts by count, so a busy venue does not grow without limit', () => {
    const grader = new VenueLatencyGrader('v', { maxSamples: 10 });
    feed(grader, 50, 10);
    expect(grader.grade(at(100)).samples).toBe(10);
  });

  it('times a call and records the outcome, including a throw', async () => {
    const grader = new VenueLatencyGrader('v');
    let clockValue = T0.getTime();
    const clock = () => clockValue;

    await grader.time(async () => {
      clockValue += 25;
      return 'ok';
    }, clock);
    expect(grader.grade(new Date(clockValue)).p95Ms).toBe(25);

    await expect(
      grader.time(async () => {
        clockValue += 900;
        throw new Error('venue said no');
      }, clock),
    ).rejects.toThrow('venue said no');

    const grade = grader.grade(new Date(clockValue));
    expect(grade.samples).toBe(2);
    expect(grade.errorRateBps).toBe(5_000);
  });
});

describe('healthFromGrade — the whole wiring into routing', () => {
  it('an F on real evidence marks the venue unhealthy, with the reason attached', () => {
    const grader = new VenueLatencyGrader('v');
    feed(grader, 20, 10_000);
    const health = healthFromGrade(grader.grade(at(100)), at(100));

    expect(health.healthy).toBe(false);
    expect(health.latencyMs).toBe(10_000);
    // The router puts this straight into `RoutePlan.rejected` — excluded AND
    // reported, which is §27's requirement, using machinery that already exists.
    expect(health.reason).toContain('grade F');
  });

  it('a provisional F does NOT exclude a venue — two samples are not evidence', () => {
    const grader = new VenueLatencyGrader('v');
    feed(grader, 2, 10_000);
    expect(healthFromGrade(grader.grade(at(50)), at(50)).healthy).toBe(true);
  });

  it('an unmeasured venue IS excluded — unmeasured is not healthy', () => {
    const health = healthFromGrade(new VenueLatencyGrader('v').grade(T0), T0);
    expect(health.healthy).toBe(false);
  });

  it('carries p95 as latencyMs, which is what the router breaks ties on', () => {
    const grader = new VenueLatencyGrader('v');
    feed(grader, 90, 20, 'ok', 0);
    feed(grader, 10, 300, 'ok', 90);
    const health = healthFromGrade(grader.grade(at(200)), at(200));
    // Not 20. At equal price you want the venue whose SLOW requests are least slow.
    expect(health.latencyMs).toBe(300);
  });

  it('feeds the existing router gate: an unhealthy venue is not routable', () => {
    const grader = new VenueLatencyGrader('v');
    feed(grader, 20, 10_000);
    const health = healthFromGrade(grader.grade(at(100)), at(100));

    const source = {
      id: 'v',
      kind: 'external-cex' as const,
      capabilities: ['quote'] as const,
      health: () => health,
      markets: async () => [],
      quote: async () => null,
      orderBook: async () => ({}) as never,
      submit: async () => ({}) as never,
    };

    expect(isRoutable(source, at(100))).toBe(false);
  });
});

describe('LatencyGradeRegistry', () => {
  it('creates a grader on first use and grades every venue at once', () => {
    const registry = new LatencyGradeRegistry();
    feed(registry.for('a'), 20, 10);
    feed(registry.for('b'), 20, 5_000);

    const grades = registry.gradeAll(at(100));
    expect(grades.map((g) => `${g.venueId}:${g.grade}`).sort()).toEqual(['a:A', 'b:F']);
  });

  it('returns the same grader for a venue rather than resetting its window', () => {
    const registry = new LatencyGradeRegistry();
    feed(registry.for('a'), 5, 10);
    feed(registry.for('a'), 5, 10, 'ok', 5);
    expect(registry.for('a').grade(at(50)).samples).toBe(10);
  });
});
