/**
 * Agents L3 — pure provider mode catalog honesty (mock vs upstream).
 *
 * Mirrors readiness.ts ProviderMode.
 */

export const PROVIDER_MODES = ['mock', 'upstream'] as const;
export type ProviderModeId = (typeof PROVIDER_MODES)[number];

/** L3 — catalog board. */
export function providerModeCatalogBoardCard(): {
  readonly modes: number;
  readonly hasMock: number;
  readonly hasUpstream: number;
} {
  return {
    modes: PROVIDER_MODES.length,
    hasMock: PROVIDER_MODES.includes('mock') ? 1 : 0,
    hasUpstream: PROVIDER_MODES.includes('upstream') ? 1 : 0,
  };
}

/** L3 — status line. */
export function providerModeCatalogStatusLine(): string {
  const c = providerModeCatalogBoardCard();
  return `modes=${c.modes} mock=${c.hasMock} upstream=${c.hasUpstream}`;
}

/** L3 — parse status. */
export function parseProviderModeCatalogStatusLine(line: string): {
  readonly modes: number;
  readonly mock: number;
  readonly upstream: number;
} | null {
  const m = line.trim().match(/^modes=(\d+) mock=([01]) upstream=([01])$/);
  if (!m) return null;
  return {
    modes: Number(m[1]),
    mock: Number(m[2]),
    upstream: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function providerModeCatalogStatusLineMatches(): boolean {
  const p = parseProviderModeCatalogStatusLine(providerModeCatalogStatusLine());
  if (!p) return false;
  const c = providerModeCatalogBoardCard();
  return p.modes === c.modes && p.mock === c.hasMock && p.upstream === c.hasUpstream;
}

/** L3 — two modes. */
export function providerModeCatalogStatusLineConsistent(line: string): boolean {
  const p = parseProviderModeCatalogStatusLine(line);
  if (!p) return false;
  return p.modes === 2 && p.mock === 1 && p.upstream === 1;
}

/** L3 — mock mode honesty residual always present when useful (board law). */
export function mockModeRequiresResidualBoard(mode: ProviderModeId, useful: boolean, residualPresent: boolean): boolean {
  if (mode !== 'mock') return true;
  if (!useful) return true;
  return residualPresent;
}

/** L3 — export header. */
export function providerModeCatalogExportHeader(): string {
  return 'mode';
}

/** L3 — export lines. */
export function providerModeCatalogExportLines(): readonly string[] {
  return [...PROVIDER_MODES];
}

/** L3 — full export. */
export function providerModeCatalogExportText(): string {
  return [providerModeCatalogExportHeader(), ...providerModeCatalogExportLines()].join('\n');
}

/** L3 — mode declared. */
export function isDeclaredProviderMode(mode: string): boolean {
  return (PROVIDER_MODES as readonly string[]).includes(mode);
}
