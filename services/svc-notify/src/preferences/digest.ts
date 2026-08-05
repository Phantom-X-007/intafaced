/**
 * Notify L3 — digest cadence residual (TRK-ops.notifications).
 *
 * Product: users may batch non-critical out-of-app traffic into digests.
 * Critical never digests — always immediate when a target exists (same as mute law).
 *
 * No Class X gateway work. No invent of send timestamps as "delivered".
 */

import type { NotifySeverity } from './mute.js';

export type DigestCadence = 'off' | 'hourly' | 'daily';

export type DigestPrefs = {
  readonly cadence: DigestCadence;
};

export const DEFAULT_DIGEST_PREFS: DigestPrefs = { cadence: 'off' };

export type DigestErrorCode = 'preference.invalid_cadence' | 'preference.critical_no_digest';

export class DigestError extends Error {
  constructor(
    message: string,
    readonly code: DigestErrorCode,
  ) {
    super(message);
    this.name = 'DigestError';
  }
}

const CADENCES: readonly DigestCadence[] = ['off', 'hourly', 'daily'];

export function assertDigestCadence(raw: string): DigestCadence {
  if ((CADENCES as readonly string[]).includes(raw)) return raw as DigestCadence;
  throw new DigestError(`Invalid digest cadence "${raw}" (use off|hourly|daily)`, 'preference.invalid_cadence');
}

export function applyDigestCadence(_current: DigestPrefs, raw: string): DigestPrefs {
  return { cadence: assertDigestCadence(raw) };
}

/**
 * Should this notification go immediately vs hold for digest batch?
 * Critical → always immediate. Cadence off → always immediate.
 */
export function shouldSendImmediate(prefs: DigestPrefs, severity: NotifySeverity): boolean {
  if (severity === 'critical') return true;
  return prefs.cadence === 'off';
}

/**
 * Pure: may this severity enter a digest bucket?
 * Critical must never be held — refuse invent silent digests of margin alerts.
 */
export function mayEnterDigest(severity: NotifySeverity): boolean {
  return severity !== 'critical';
}

export function assertMayDigest(severity: NotifySeverity): void {
  if (!mayEnterDigest(severity)) {
    throw new DigestError('Critical notifications cannot enter a digest — send immediate', 'preference.critical_no_digest');
  }
}

/** Window length for cadence (ms). off → 0 (no hold). */
export function digestWindowMs(cadence: DigestCadence): number {
  switch (cadence) {
    case 'off':
      return 0;
    case 'hourly':
      return 3_600_000;
    case 'daily':
      return 86_400_000;
  }
}

/**
 * Decide whether a held batch is ready to flush.
 * lastFlushAt null → first flush only after window if items exist (caller owns items).
 */
export function isDigestFlushDue(input: { cadence: DigestCadence; lastFlushAt: Date | null; now?: Date }): boolean {
  if (input.cadence === 'off') return false;
  const window = digestWindowMs(input.cadence);
  const now = (input.now ?? new Date()).getTime();
  if (!input.lastFlushAt) return true; // never flushed — due if any items (caller checks)
  return now - input.lastFlushAt.getTime() >= window;
}

/**
 * L3 — whether cadence holds non-critical messages. off → false (no invent hold).
 */
export function isDigestHolding(cadence: DigestCadence): boolean {
  return cadence !== 'off';
}

/**
 * L3 — holding cadences only (excludes off). Stable list for operator UI.
 */
export function holdingDigestCadences(): readonly DigestCadence[] {
  return ['hourly', 'daily'];
}

/** In-memory digest prefs for tests / Stage process store. */
export class MemoryDigestStore {
  private readonly byUser = new Map<string, DigestCadence>();

  get(userId: string): DigestPrefs {
    return { cadence: this.byUser.get(userId) ?? 'off' };
  }

  setCadence(userId: string, raw: string): DigestPrefs {
    const next = applyDigestCadence(this.get(userId), raw);
    this.byUser.set(userId, next.cadence);
    return next;
  }
}

/** L3 — all cadences in stable order. */
export function allDigestCadences(): readonly DigestCadence[] {
  return ['off', 'hourly', 'daily'];
}

/** L3 — true when cadence is off. */
export function isDigestOff(cadence: DigestCadence): boolean {
  return cadence === 'off';
}

/** L3 — true when cadence is daily. */
export function isDigestDaily(cadence: DigestCadence): boolean {
  return cadence === 'daily';
}

/** L3 — true when cadence is hourly. */
export function isDigestHourly(cadence: DigestCadence): boolean {
  return cadence === 'hourly';
}

/** L3 — window ms label string. */
export function digestWindowMsLabel(cadence: DigestCadence): string {
  return String(digestWindowMs(cadence));
}
