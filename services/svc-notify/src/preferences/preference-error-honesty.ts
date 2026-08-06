/**
 * Notify L3 — pure mute/digest preference error-code catalog honesty.
 *
 * Mirrors mute.ts MuteUpdateErrorCode + digest.ts DigestErrorCode.
 */

export const MUTE_UPDATE_ERROR_CODES = [
  'preference.critical_cannot_mute',
  'preference.invalid_channel',
] as const;

export const DIGEST_ERROR_CODES = [
  'preference.invalid_cadence',
  'preference.critical_no_digest',
] as const;

/** L3 — mute error catalog board. */
export function muteErrorCatalogBoardCard(): {
  readonly codes: number;
  readonly hasCriticalCannotMute: number;
  readonly hasInvalidChannel: number;
} {
  return {
    codes: MUTE_UPDATE_ERROR_CODES.length,
    hasCriticalCannotMute: MUTE_UPDATE_ERROR_CODES.includes('preference.critical_cannot_mute')
      ? 1
      : 0,
    hasInvalidChannel: MUTE_UPDATE_ERROR_CODES.includes('preference.invalid_channel') ? 1 : 0,
  };
}

/** L3 — mute status line. */
export function muteErrorCatalogStatusLine(): string {
  const c = muteErrorCatalogBoardCard();
  return `codes=${c.codes} critical_cannot_mute=${c.hasCriticalCannotMute} invalid_channel=${c.hasInvalidChannel}`;
}

/** L3 — parse mute. */
export function parseMuteErrorCatalogStatusLine(line: string): {
  readonly codes: number;
  readonly criticalCannotMute: number;
  readonly invalidChannel: number;
} | null {
  const m = line
    .trim()
    .match(/^codes=(\d+) critical_cannot_mute=([01]) invalid_channel=([01])$/);
  if (!m) return null;
  return {
    codes: Number(m[1]),
    criticalCannotMute: Number(m[2]),
    invalidChannel: Number(m[3]),
  };
}

/** L3 — true when mute catalog matches. */
export function muteErrorCatalogStatusLineMatches(): boolean {
  const p = parseMuteErrorCatalogStatusLine(muteErrorCatalogStatusLine());
  if (!p) return false;
  const c = muteErrorCatalogBoardCard();
  return (
    p.codes === c.codes &&
    p.criticalCannotMute === c.hasCriticalCannotMute &&
    p.invalidChannel === c.hasInvalidChannel
  );
}

/** L3 — critical cannot mute is load-bearing. */
export function muteErrorCatalogStatusLineConsistent(line: string): boolean {
  const p = parseMuteErrorCatalogStatusLine(line);
  if (!p) return false;
  return p.codes === 2 && p.criticalCannotMute === 1;
}

/** L3 — digest error catalog board. */
export function digestErrorCatalogBoardCard(): {
  readonly codes: number;
  readonly hasInvalidCadence: number;
  readonly hasCriticalNoDigest: number;
} {
  return {
    codes: DIGEST_ERROR_CODES.length,
    hasInvalidCadence: DIGEST_ERROR_CODES.includes('preference.invalid_cadence') ? 1 : 0,
    hasCriticalNoDigest: DIGEST_ERROR_CODES.includes('preference.critical_no_digest') ? 1 : 0,
  };
}

/** L3 — digest status line. */
export function digestErrorCatalogStatusLine(): string {
  const c = digestErrorCatalogBoardCard();
  return `codes=${c.codes} invalid_cadence=${c.hasInvalidCadence} critical_no_digest=${c.hasCriticalNoDigest}`;
}

/** L3 — parse digest. */
export function parseDigestErrorCatalogStatusLine(line: string): {
  readonly codes: number;
  readonly invalidCadence: number;
  readonly criticalNoDigest: number;
} | null {
  const m = line
    .trim()
    .match(/^codes=(\d+) invalid_cadence=([01]) critical_no_digest=([01])$/);
  if (!m) return null;
  return {
    codes: Number(m[1]),
    invalidCadence: Number(m[2]),
    criticalNoDigest: Number(m[3]),
  };
}

/** L3 — true when digest catalog matches. */
export function digestErrorCatalogStatusLineMatches(): boolean {
  const p = parseDigestErrorCatalogStatusLine(digestErrorCatalogStatusLine());
  if (!p) return false;
  const c = digestErrorCatalogBoardCard();
  return (
    p.codes === c.codes &&
    p.invalidCadence === c.hasInvalidCadence &&
    p.criticalNoDigest === c.hasCriticalNoDigest
  );
}

/** L3 — critical never digests. */
export function digestErrorCatalogStatusLineConsistent(line: string): boolean {
  const p = parseDigestErrorCatalogStatusLine(line);
  if (!p) return false;
  return p.codes === 2 && p.criticalNoDigest === 1;
}

/** L3 — mute code declared. */
export function isDeclaredMuteErrorCode(code: string): boolean {
  return (MUTE_UPDATE_ERROR_CODES as readonly string[]).includes(code);
}

/** L3 — digest code declared. */
export function isDeclaredDigestErrorCode(code: string): boolean {
  return (DIGEST_ERROR_CODES as readonly string[]).includes(code);
}
