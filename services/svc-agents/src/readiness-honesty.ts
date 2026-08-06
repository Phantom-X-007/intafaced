/**
 * Agents L3 — pure readiness / useful-path honesty boards (no provider I/O).
 *
 * Shapes mirror readiness.ts AgentsReadiness. Never invents usable path.
 */

export type ProviderReadinessInput = {
  readonly id: string;
  readonly usable: boolean;
  readonly healthy: boolean;
};

export type UsefulPathInput = {
  readonly available: boolean;
  readonly task: string | null;
  readonly residual: string | null;
};

export type AgentsReadinessInput = {
  readonly providerMode: 'mock' | 'upstream';
  readonly providers: readonly ProviderReadinessInput[];
  readonly meteringEnabled: boolean;
  readonly tasks: readonly string[];
  readonly usefulPath: UsefulPathInput;
};

/** L3 — usable count. */
export function usableCount(readiness: AgentsReadinessInput): number {
  return readiness.providers.filter((p) => p.usable).length;
}

/** L3 — healthy count. */
export function healthyCount(readiness: AgentsReadinessInput): number {
  return readiness.providers.filter((p) => p.healthy).length;
}

/** L3 — board card. */
export function readinessBoardCard(readiness: AgentsReadinessInput): {
  readonly mode: string;
  readonly providers: number;
  readonly usable: number;
  readonly healthy: number;
  readonly tasks: number;
  readonly useful: number;
  readonly metering: number;
  readonly residualPresent: number;
} {
  return {
    mode: readiness.providerMode,
    providers: readiness.providers.length,
    usable: usableCount(readiness),
    healthy: healthyCount(readiness),
    tasks: readiness.tasks.length,
    useful: readiness.usefulPath.available ? 1 : 0,
    metering: readiness.meteringEnabled ? 1 : 0,
    residualPresent: readiness.usefulPath.residual != null ? 1 : 0,
  };
}

/** L3 — status line. */
export function readinessStatusLine(readiness: AgentsReadinessInput): string {
  const c = readinessBoardCard(readiness);
  return `mode=${c.mode} providers=${c.providers} usable=${c.usable} healthy=${c.healthy} tasks=${c.tasks} useful=${c.useful} metering=${c.metering} residual=${c.residualPresent}`;
}

/** L3 — parse status. */
export function parseReadinessStatusLine(line: string): {
  readonly mode: string;
  readonly providers: number;
  readonly usable: number;
  readonly healthy: number;
  readonly tasks: number;
  readonly useful: number;
  readonly metering: number;
  readonly residual: number;
} | null {
  const m = line
    .trim()
    .match(/^mode=(mock|upstream) providers=(\d+) usable=(\d+) healthy=(\d+) tasks=(\d+) useful=([01]) metering=([01]) residual=([01])$/);
  if (!m) return null;
  return {
    mode: m[1]!,
    providers: Number(m[2]),
    usable: Number(m[3]),
    healthy: Number(m[4]),
    tasks: Number(m[5]),
    useful: Number(m[6]),
    metering: Number(m[7]),
    residual: Number(m[8]),
  };
}

/** L3 — true when status matches. */
export function readinessStatusLineMatches(readiness: AgentsReadinessInput): boolean {
  const p = parseReadinessStatusLine(readinessStatusLine(readiness));
  if (!p) return false;
  const c = readinessBoardCard(readiness);
  return (
    p.mode === c.mode &&
    p.providers === c.providers &&
    p.usable === c.usable &&
    p.healthy === c.healthy &&
    p.tasks === c.tasks &&
    p.useful === c.useful &&
    p.metering === c.metering &&
    p.residual === c.residualPresent
  );
}

/** L3 — usable/healthy cannot exceed providers. */
export function readinessStatusLineConsistent(line: string): boolean {
  const p = parseReadinessStatusLine(line);
  if (!p) return false;
  return p.usable <= p.providers && p.healthy <= p.providers && p.useful <= 1;
}

/** L3 — export header. */
export function readinessExportHeader(): string {
  return 'mode,providers,usable,healthy,tasks,useful,metering,residual';
}

/** L3 — export line. */
export function readinessExportLine(readiness: AgentsReadinessInput): string {
  const c = readinessBoardCard(readiness);
  return `${c.mode},${c.providers},${c.usable},${c.healthy},${c.tasks},${c.useful},${c.metering},${c.residualPresent}`;
}

/** L3 — full export. */
export function readinessExportText(readiness: AgentsReadinessInput): string {
  return [readinessExportHeader(), readinessExportLine(readiness)].join('\n');
}

/** L3 — mock mode always should surface residual when useful (honesty law). */
export function mockUsefulImpliesResidual(readiness: AgentsReadinessInput): boolean {
  if (readiness.providerMode !== 'mock') return true;
  if (!readiness.usefulPath.available) return true;
  return readiness.usefulPath.residual != null;
}

/** L3 — provider count in range. */
export function providerCountInRange(readiness: AgentsReadinessInput, min: number, max: number): boolean {
  if (min > max) return false;
  const n = readiness.providers.length;
  return n >= min && n <= max;
}
