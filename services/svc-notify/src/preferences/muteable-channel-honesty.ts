/**
 * Notify L3 — pure muteable channel catalog honesty (structural only).
 *
 * Mirrors mute.ts MuteableChannel: email | push | sms.
 * Critical never muteable (law on tip).
 */

export const MUTEABLE_CHANNELS = ['email', 'push', 'sms'] as const;
export type MuteableChannelId = (typeof MUTEABLE_CHANNELS)[number];

/** L3 — catalog board. */
export function muteableChannelCatalogBoardCard(): {
  readonly channels: number;
  readonly hasEmail: number;
  readonly hasPush: number;
  readonly hasSms: number;
  readonly criticalMuteable: number;
} {
  return {
    channels: MUTEABLE_CHANNELS.length,
    hasEmail: MUTEABLE_CHANNELS.includes('email') ? 1 : 0,
    hasPush: MUTEABLE_CHANNELS.includes('push') ? 1 : 0,
    hasSms: MUTEABLE_CHANNELS.includes('sms') ? 1 : 0,
    criticalMuteable: 0,
  };
}

/** L3 — status line. */
export function muteableChannelCatalogStatusLine(): string {
  const c = muteableChannelCatalogBoardCard();
  return `channels=${c.channels} email=${c.hasEmail} push=${c.hasPush} sms=${c.hasSms} critical_mute=${c.criticalMuteable}`;
}

/** L3 — parse status. */
export function parseMuteableChannelCatalogStatusLine(line: string): {
  readonly channels: number;
  readonly email: number;
  readonly push: number;
  readonly sms: number;
  readonly criticalMute: number;
} | null {
  const m = line.trim().match(/^channels=(\d+) email=([01]) push=([01]) sms=([01]) critical_mute=([01])$/);
  if (!m) return null;
  return {
    channels: Number(m[1]),
    email: Number(m[2]),
    push: Number(m[3]),
    sms: Number(m[4]),
    criticalMute: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function muteableChannelCatalogStatusLineMatches(): boolean {
  const p = parseMuteableChannelCatalogStatusLine(muteableChannelCatalogStatusLine());
  if (!p) return false;
  const c = muteableChannelCatalogBoardCard();
  return (
    p.channels === c.channels &&
    p.email === c.hasEmail &&
    p.push === c.hasPush &&
    p.sms === c.hasSms &&
    p.criticalMute === c.criticalMuteable
  );
}

/** L3 — three channels; critical never muteable. */
export function muteableChannelCatalogStatusLineConsistent(line: string): boolean {
  const p = parseMuteableChannelCatalogStatusLine(line);
  if (!p) return false;
  return p.channels === 3 && p.criticalMute === 0 && p.email === 1 && p.push === 1 && p.sms === 1;
}

/** L3 — export header. */
export function muteableChannelCatalogExportHeader(): string {
  return 'channel';
}

/** L3 — export lines. */
export function muteableChannelCatalogExportLines(): readonly string[] {
  return [...MUTEABLE_CHANNELS];
}

/** L3 — full export. */
export function muteableChannelCatalogExportText(): string {
  return [muteableChannelCatalogExportHeader(), ...muteableChannelCatalogExportLines()].join('\n');
}

/** L3 — channel declared. */
export function isDeclaredMuteableChannel(ch: string): boolean {
  return (MUTEABLE_CHANNELS as readonly string[]).includes(ch);
}
