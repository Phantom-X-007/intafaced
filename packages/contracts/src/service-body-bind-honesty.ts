/**
 * Contracts L3 — pure service body-bind mode catalog honesty.
 *
 * Mirrors service-auth.ts SERVICE_BODY_BIND_MODES: accept-both | require.
 * Does not invent auth product law.
 */

export const SERVICE_BODY_BIND_MODES = ['accept-both', 'require'] as const;
export type ServiceBodyBindModeId = (typeof SERVICE_BODY_BIND_MODES)[number];

/** L3 — catalog board. */
export function serviceBodyBindCatalogBoardCard(): {
  readonly modes: number;
  readonly hasAcceptBoth: number;
  readonly hasRequire: number;
} {
  return {
    modes: SERVICE_BODY_BIND_MODES.length,
    hasAcceptBoth: SERVICE_BODY_BIND_MODES.includes('accept-both') ? 1 : 0,
    hasRequire: SERVICE_BODY_BIND_MODES.includes('require') ? 1 : 0,
  };
}

/** L3 — status line. */
export function serviceBodyBindCatalogStatusLine(): string {
  const c = serviceBodyBindCatalogBoardCard();
  return `modes=${c.modes} accept_both=${c.hasAcceptBoth} require=${c.hasRequire}`;
}

/** L3 — parse status. */
export function parseServiceBodyBindCatalogStatusLine(line: string): {
  readonly modes: number;
  readonly acceptBoth: number;
  readonly require: number;
} | null {
  const m = line.trim().match(/^modes=(\d+) accept_both=([01]) require=([01])$/);
  if (!m) return null;
  return { modes: Number(m[1]), acceptBoth: Number(m[2]), require: Number(m[3]) };
}

/** L3 — true when status matches. */
export function serviceBodyBindCatalogStatusLineMatches(): boolean {
  const p = parseServiceBodyBindCatalogStatusLine(serviceBodyBindCatalogStatusLine());
  if (!p) return false;
  const c = serviceBodyBindCatalogBoardCard();
  return p.modes === c.modes && p.acceptBoth === c.hasAcceptBoth && p.require === c.hasRequire;
}

/** L3 — two modes. */
export function serviceBodyBindCatalogStatusLineConsistent(line: string): boolean {
  const p = parseServiceBodyBindCatalogStatusLine(line);
  if (!p) return false;
  return p.modes === 2 && p.acceptBoth === 1 && p.require === 1;
}

/** L3 — export header. */
export function serviceBodyBindCatalogExportHeader(): string {
  return 'mode';
}

/** L3 — export lines. */
export function serviceBodyBindCatalogExportLines(): readonly string[] {
  return [...SERVICE_BODY_BIND_MODES];
}

/** L3 — full export. */
export function serviceBodyBindCatalogExportText(): string {
  return [serviceBodyBindCatalogExportHeader(), ...serviceBodyBindCatalogExportLines()].join('\n');
}

/** L3 — mode declared. */
export function isDeclaredServiceBodyBindMode(mode: string): boolean {
  return (SERVICE_BODY_BIND_MODES as readonly string[]).includes(mode);
}
