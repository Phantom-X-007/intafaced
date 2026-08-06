/**
 * Notify L3 — pure mute law catalog honesty boards (no send I/O).
 *
 * Mirrors mute.ts severity + muteable channels. Critical never muteable.
 */

export const NOTIFY_SEVERITIES = ['info', 'action', 'critical'] as const;
export const MUTEABLE_CHANNELS = ['email', 'push', 'sms'] as const;

export type MuteBoardInput = {
  readonly muted: readonly (typeof MUTEABLE_CHANNELS)[number][];
};

/** L3 — catalog sizes. */
export function muteCatalogBoardCard(): {
  readonly severities: number;
  readonly muteableChannels: number;
  readonly criticalMuteable: number;
} {
  return {
    severities: NOTIFY_SEVERITIES.length,
    muteableChannels: MUTEABLE_CHANNELS.length,
    criticalMuteable: 0,
  };
}

/** L3 — catalog status line. */
export function muteCatalogStatusLine(): string {
  const c = muteCatalogBoardCard();
  return `severities=${c.severities} muteable=${c.muteableChannels} critical_muteable=${c.criticalMuteable}`;
}

/** L3 — parse catalog. */
export function parseMuteCatalogStatusLine(line: string): {
  readonly severities: number;
  readonly muteable: number;
  readonly criticalMuteable: number;
} | null {
  const m = line.trim().match(/^severities=(\d+) muteable=(\d+) critical_muteable=(\d+)$/);
  if (!m) return null;
  return {
    severities: Number(m[1]),
    muteable: Number(m[2]),
    criticalMuteable: Number(m[3]),
  };
}

/** L3 — true when catalog matches. */
export function muteCatalogStatusLineMatches(): boolean {
  const p = parseMuteCatalogStatusLine(muteCatalogStatusLine());
  if (!p) return false;
  const c = muteCatalogBoardCard();
  return (
    p.severities === c.severities &&
    p.muteable === c.muteableChannels &&
    p.criticalMuteable === c.criticalMuteable
  );
}

/** L3 — critical never muteable. */
export function muteCatalogStatusLineConsistent(line: string): boolean {
  const p = parseMuteCatalogStatusLine(line);
  if (!p) return false;
  return p.criticalMuteable === 0 && p.muteable === MUTEABLE_CHANNELS.length;
}

/** L3 — prefs board. */
export function mutePrefsBoardCard(prefs: MuteBoardInput): {
  readonly muted: number;
  readonly unmuted: number;
} {
  const muted = new Set(prefs.muted);
  return {
    muted: muted.size,
    unmuted: MUTEABLE_CHANNELS.filter((c) => !muted.has(c)).length,
  };
}

/** L3 — prefs status line. */
export function mutePrefsStatusLine(prefs: MuteBoardInput): string {
  const c = mutePrefsBoardCard(prefs);
  return `muted=${c.muted} unmuted=${c.unmuted}`;
}

/** L3 — parse prefs. */
export function parseMutePrefsStatusLine(
  line: string,
): { readonly muted: number; readonly unmuted: number } | null {
  const m = line.trim().match(/^muted=(\d+) unmuted=(\d+)$/);
  if (!m) return null;
  return { muted: Number(m[1]), unmuted: Number(m[2]) };
}

/** L3 — true when prefs status matches. */
export function mutePrefsStatusLineMatches(prefs: MuteBoardInput): boolean {
  const p = parseMutePrefsStatusLine(mutePrefsStatusLine(prefs));
  if (!p) return false;
  const c = mutePrefsBoardCard(prefs);
  return p.muted === c.muted && p.unmuted === c.unmuted;
}

/** L3 — muted+unmuted equals muteable channels. */
export function mutePrefsStatusLineConsistent(line: string): boolean {
  const p = parseMutePrefsStatusLine(line);
  if (!p) return false;
  return p.muted + p.unmuted === MUTEABLE_CHANNELS.length;
}

/** L3 — export header. */
export function mutePrefsExportHeader(): string {
  return 'muted,unmuted';
}

/** L3 — export line. */
export function mutePrefsExportLine(prefs: MuteBoardInput): string {
  const c = mutePrefsBoardCard(prefs);
  return `${c.muted},${c.unmuted}`;
}

/** L3 — full export. */
export function mutePrefsExportText(prefs: MuteBoardInput): string {
  return [mutePrefsExportHeader(), mutePrefsExportLine(prefs)].join('\n');
}

/** L3 — channel declared muteable. */
export function isMuteableChannel(channel: string): boolean {
  return (MUTEABLE_CHANNELS as readonly string[]).includes(channel);
}
