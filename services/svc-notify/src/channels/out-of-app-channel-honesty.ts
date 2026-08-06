/**
 * Notify L3 — pure out-of-app channel catalog honesty (structural only).
 *
 * Mirrors channel.ts OUT_OF_APP_CHANNELS: email | push | sms.
 * Complements channel-id-honesty (full 4). Does not invent gateway vendors.
 */

export const OUT_OF_APP_CHANNEL_IDS = ['email', 'push', 'sms'] as const;
export type OutOfAppChannelHonestyId = (typeof OUT_OF_APP_CHANNEL_IDS)[number];

/** L3 — catalog board. */
export function outOfAppChannelCatalogBoardCard(): {
  readonly channels: number;
  readonly hasEmail: number;
  readonly hasPush: number;
  readonly hasSms: number;
  readonly includesInapp: number;
} {
  return {
    channels: OUT_OF_APP_CHANNEL_IDS.length,
    hasEmail: OUT_OF_APP_CHANNEL_IDS.includes('email') ? 1 : 0,
    hasPush: OUT_OF_APP_CHANNEL_IDS.includes('push') ? 1 : 0,
    hasSms: OUT_OF_APP_CHANNEL_IDS.includes('sms') ? 1 : 0,
    includesInapp: 0,
  };
}

/** L3 — status line. */
export function outOfAppChannelCatalogStatusLine(): string {
  const c = outOfAppChannelCatalogBoardCard();
  return `channels=${c.channels} email=${c.hasEmail} push=${c.hasPush} sms=${c.hasSms} inapp=${c.includesInapp}`;
}

/** L3 — parse status. */
export function parseOutOfAppChannelCatalogStatusLine(line: string): {
  readonly channels: number;
  readonly email: number;
  readonly push: number;
  readonly sms: number;
  readonly inapp: number;
} | null {
  const m = line.trim().match(/^channels=(\d+) email=([01]) push=([01]) sms=([01]) inapp=([01])$/);
  if (!m) return null;
  return {
    channels: Number(m[1]),
    email: Number(m[2]),
    push: Number(m[3]),
    sms: Number(m[4]),
    inapp: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function outOfAppChannelCatalogStatusLineMatches(): boolean {
  const p = parseOutOfAppChannelCatalogStatusLine(outOfAppChannelCatalogStatusLine());
  if (!p) return false;
  const c = outOfAppChannelCatalogBoardCard();
  return p.channels === c.channels && p.email === c.hasEmail && p.push === c.hasPush && p.sms === c.hasSms && p.inapp === c.includesInapp;
}

/** L3 — three out-of-app, never inapp. */
export function outOfAppChannelCatalogStatusLineConsistent(line: string): boolean {
  const p = parseOutOfAppChannelCatalogStatusLine(line);
  if (!p) return false;
  return p.channels === 3 && p.email === 1 && p.push === 1 && p.sms === 1 && p.inapp === 0;
}

/** L3 — export header. */
export function outOfAppChannelCatalogExportHeader(): string {
  return 'channel';
}

/** L3 — export lines. */
export function outOfAppChannelCatalogExportLines(): readonly string[] {
  return [...OUT_OF_APP_CHANNEL_IDS];
}

/** L3 — full export. */
export function outOfAppChannelCatalogExportText(): string {
  return [outOfAppChannelCatalogExportHeader(), ...outOfAppChannelCatalogExportLines()].join('\n');
}

/** L3 — channel declared out-of-app. */
export function isDeclaredOutOfAppChannel(id: string): boolean {
  return (OUT_OF_APP_CHANNEL_IDS as readonly string[]).includes(id);
}
