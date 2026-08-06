/**
 * Notify L3 — pure channel id catalog honesty (structural only).
 *
 * Mirrors channels/channel.ts CHANNEL_IDS + OUT_OF_APP_CHANNELS.
 * Does not invent vendor SMS/email providers.
 */

export const CHANNEL_IDS = ['inapp', 'email', 'push', 'sms'] as const;
export type ChannelIdHonesty = (typeof CHANNEL_IDS)[number];

export const OUT_OF_APP_CHANNEL_IDS = ['email', 'push', 'sms'] as const;

/** L3 — catalog board. */
export function channelIdCatalogBoardCard(): {
  readonly channels: number;
  readonly outOfApp: number;
  readonly hasInapp: number;
  readonly hasEmail: number;
  readonly hasPush: number;
  readonly hasSms: number;
} {
  return {
    channels: CHANNEL_IDS.length,
    outOfApp: OUT_OF_APP_CHANNEL_IDS.length,
    hasInapp: CHANNEL_IDS.includes('inapp') ? 1 : 0,
    hasEmail: CHANNEL_IDS.includes('email') ? 1 : 0,
    hasPush: CHANNEL_IDS.includes('push') ? 1 : 0,
    hasSms: CHANNEL_IDS.includes('sms') ? 1 : 0,
  };
}

/** L3 — status line. */
export function channelIdCatalogStatusLine(): string {
  const c = channelIdCatalogBoardCard();
  return `channels=${c.channels} out_of_app=${c.outOfApp} inapp=${c.hasInapp} email=${c.hasEmail} push=${c.hasPush} sms=${c.hasSms}`;
}

/** L3 — parse status. */
export function parseChannelIdCatalogStatusLine(line: string): {
  readonly channels: number;
  readonly outOfApp: number;
  readonly inapp: number;
  readonly email: number;
  readonly push: number;
  readonly sms: number;
} | null {
  const m = line.trim().match(/^channels=(\d+) out_of_app=(\d+) inapp=([01]) email=([01]) push=([01]) sms=([01])$/);
  if (!m) return null;
  return {
    channels: Number(m[1]),
    outOfApp: Number(m[2]),
    inapp: Number(m[3]),
    email: Number(m[4]),
    push: Number(m[5]),
    sms: Number(m[6]),
  };
}

/** L3 — true when status matches. */
export function channelIdCatalogStatusLineMatches(): boolean {
  const p = parseChannelIdCatalogStatusLine(channelIdCatalogStatusLine());
  if (!p) return false;
  const c = channelIdCatalogBoardCard();
  return (
    p.channels === c.channels &&
    p.outOfApp === c.outOfApp &&
    p.inapp === c.hasInapp &&
    p.email === c.hasEmail &&
    p.push === c.hasPush &&
    p.sms === c.hasSms
  );
}

/** L3 — four channels, three out-of-app. */
export function channelIdCatalogStatusLineConsistent(line: string): boolean {
  const p = parseChannelIdCatalogStatusLine(line);
  if (!p) return false;
  return p.channels === 4 && p.outOfApp === 3 && p.inapp === 1 && p.email === 1 && p.push === 1 && p.sms === 1;
}

/** L3 — export header. */
export function channelIdCatalogExportHeader(): string {
  return 'channel,out_of_app';
}

/** L3 — export lines. */
export function channelIdCatalogExportLines(): readonly string[] {
  return CHANNEL_IDS.map((id) => {
    const ooa = (OUT_OF_APP_CHANNEL_IDS as readonly string[]).includes(id) ? 1 : 0;
    return `${id},${ooa}`;
  });
}

/** L3 — full export. */
export function channelIdCatalogExportText(): string {
  return [channelIdCatalogExportHeader(), ...channelIdCatalogExportLines()].join('\n');
}

/** L3 — channel declared. */
export function isDeclaredChannelId(id: string): boolean {
  return (CHANNEL_IDS as readonly string[]).includes(id);
}

/** L3 — true when channel is out-of-app. */
export function isOutOfAppChannelId(id: string): boolean {
  return (OUT_OF_APP_CHANNEL_IDS as readonly string[]).includes(id);
}
