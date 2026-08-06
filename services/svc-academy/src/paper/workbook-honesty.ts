/**
 * Academy L3 — pure paper workbook drill honesty boards (no trade I/O).
 *
 * Shapes mirror workbook-loop.ts DrillRun. Never invents fills or prices.
 */

export type DrillRunBoardInput = {
  readonly status: 'active' | 'complete' | 'refused';
  readonly stepCount: number;
  readonly completedCount: number;
  readonly refuseReason?: 'not_paper' | 'no_market' | 'unknown_step' | 'bad_fill';
};

/** L3 — board card. */
export function drillRunBoardCard(run: DrillRunBoardInput): {
  readonly status: string;
  readonly steps: number;
  readonly completed: number;
  readonly remaining: number;
  readonly refuse: string;
} {
  const completed = run.status === 'refused' ? 0 : run.completedCount;
  const remaining = run.status === 'refused' ? run.stepCount : Math.max(0, run.stepCount - completed);
  return {
    status: run.status,
    steps: run.stepCount,
    completed,
    remaining,
    refuse: run.refuseReason ?? '-',
  };
}

/** L3 — status line. */
export function drillRunStatusLine(run: DrillRunBoardInput): string {
  const c = drillRunBoardCard(run);
  return `status=${c.status} steps=${c.steps} completed=${c.completed} remaining=${c.remaining} refuse=${c.refuse}`;
}

/** L3 — parse status. */
export function parseDrillRunStatusLine(line: string): {
  readonly status: string;
  readonly steps: number;
  readonly completed: number;
  readonly remaining: number;
  readonly refuse: string;
} | null {
  const m = line
    .trim()
    .match(
      /^status=(active|complete|refused) steps=(\d+) completed=(\d+) remaining=(\d+) refuse=([a-z0-9_-]+)$/,
    );
  if (!m) return null;
  return {
    status: m[1]!,
    steps: Number(m[2]),
    completed: Number(m[3]),
    remaining: Number(m[4]),
    refuse: m[5]!,
  };
}

/** L3 — true when status matches. */
export function drillRunStatusLineMatches(run: DrillRunBoardInput): boolean {
  const p = parseDrillRunStatusLine(drillRunStatusLine(run));
  if (!p) return false;
  const c = drillRunBoardCard(run);
  return (
    p.status === c.status &&
    p.steps === c.steps &&
    p.completed === c.completed &&
    p.remaining === c.remaining &&
    p.refuse === c.refuse
  );
}

/** L3 — completed+remaining equals steps when not refused; refused completed=0. */
export function drillRunStatusLineConsistent(line: string): boolean {
  const p = parseDrillRunStatusLine(line);
  if (!p) return false;
  if (p.status === 'refused') return p.completed === 0 && p.remaining === p.steps;
  return p.completed + p.remaining === p.steps;
}

/** L3 — export header. */
export function drillRunExportHeader(): string {
  return 'status,steps,completed,remaining,refuse';
}

/** L3 — export line. */
export function drillRunExportLine(run: DrillRunBoardInput): string {
  const c = drillRunBoardCard(run);
  return `${c.status},${c.steps},${c.completed},${c.remaining},${c.refuse}`;
}

/** L3 — full export. */
export function drillRunExportText(run: DrillRunBoardInput): string {
  return [drillRunExportHeader(), drillRunExportLine(run)].join('\n');
}

/** L3 — true when complete with no remaining. */
export function drillIsFullyComplete(run: DrillRunBoardInput): boolean {
  const c = drillRunBoardCard(run);
  return c.status === 'complete' && c.remaining === 0 && c.completed === c.steps;
}

/** L3 — true when refused. */
export function drillIsRefused(run: DrillRunBoardInput): boolean {
  return run.status === 'refused';
}

/** L3 — step count in range. */
export function drillStepCountInRange(run: DrillRunBoardInput, min: number, max: number): boolean {
  if (min > max) return false;
  return run.stepCount >= min && run.stepCount <= max;
}
