/**
 * Contracts L3 — pure S2S service-auth header catalog honesty (no crypto I/O).
 *
 * Mirrors service-auth.ts header names + skew/bind constants.
 * Does not invent signatures or body digests.
 */

export const SERVICE_AUTH_HEADER_NAMES = [
  'x-intafaced-service',
  'x-intafaced-service-ts',
  'x-intafaced-service-sig',
  'x-intafaced-service-body',
] as const;

export const SERVICE_CALL_MAX_SKEW_SECONDS = 300;
export const SERVICE_BODY_BIND_MODES = ['accept-both', 'require'] as const;
export const DEFAULT_SERVICE_BODY_BIND_MODE = 'accept-both';

/** L3 — catalog board. */
export function serviceAuthCatalogBoardCard(): {
  readonly headers: number;
  readonly maxSkewSeconds: number;
  readonly bindModes: number;
  readonly defaultBind: string;
} {
  return {
    headers: SERVICE_AUTH_HEADER_NAMES.length,
    maxSkewSeconds: SERVICE_CALL_MAX_SKEW_SECONDS,
    bindModes: SERVICE_BODY_BIND_MODES.length,
    defaultBind: DEFAULT_SERVICE_BODY_BIND_MODE,
  };
}

/** L3 — status line. */
export function serviceAuthCatalogStatusLine(): string {
  const c = serviceAuthCatalogBoardCard();
  return `headers=${c.headers} max_skew_s=${c.maxSkewSeconds} bind_modes=${c.bindModes} default_bind=${c.defaultBind}`;
}

/** L3 — parse status. */
export function parseServiceAuthCatalogStatusLine(line: string): {
  readonly headers: number;
  readonly maxSkewSeconds: number;
  readonly bindModes: number;
  readonly defaultBind: string;
} | null {
  const m = line
    .trim()
    .match(
      /^headers=(\d+) max_skew_s=(\d+) bind_modes=(\d+) default_bind=(accept-both|require)$/,
    );
  if (!m) return null;
  return {
    headers: Number(m[1]),
    maxSkewSeconds: Number(m[2]),
    bindModes: Number(m[3]),
    defaultBind: m[4]!,
  };
}

/** L3 — true when status matches. */
export function serviceAuthCatalogStatusLineMatches(): boolean {
  const p = parseServiceAuthCatalogStatusLine(serviceAuthCatalogStatusLine());
  if (!p) return false;
  const c = serviceAuthCatalogBoardCard();
  return (
    p.headers === c.headers &&
    p.maxSkewSeconds === c.maxSkewSeconds &&
    p.bindModes === c.bindModes &&
    p.defaultBind === c.defaultBind
  );
}

/** L3 — skew positive; four headers. */
export function serviceAuthCatalogStatusLineConsistent(line: string): boolean {
  const p = parseServiceAuthCatalogStatusLine(line);
  if (!p) return false;
  return p.headers === 4 && p.maxSkewSeconds > 0 && p.bindModes === 2;
}

/** L3 — export header. */
export function serviceAuthCatalogExportHeader(): string {
  return 'headers,max_skew_s,bind_modes,default_bind';
}

/** L3 — export line. */
export function serviceAuthCatalogExportLine(): string {
  const c = serviceAuthCatalogBoardCard();
  return `${c.headers},${c.maxSkewSeconds},${c.bindModes},${c.defaultBind}`;
}

/** L3 — full export. */
export function serviceAuthCatalogExportText(): string {
  return [serviceAuthCatalogExportHeader(), serviceAuthCatalogExportLine()].join('\n');
}

/** L3 — header declared. */
export function isDeclaredServiceAuthHeader(name: string): boolean {
  return (SERVICE_AUTH_HEADER_NAMES as readonly string[]).includes(name);
}

/** L3 — bind mode declared. */
export function isDeclaredBodyBindMode(mode: string): boolean {
  return (SERVICE_BODY_BIND_MODES as readonly string[]).includes(mode);
}

/** L3 — names list. */
export function serviceAuthHeaderNames(): readonly string[] {
  return [...SERVICE_AUTH_HEADER_NAMES];
}
