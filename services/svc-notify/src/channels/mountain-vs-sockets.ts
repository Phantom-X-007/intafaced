/**
 * D26-P1-O5 — Fan-out mountain vs §13 channel sockets (explicit, honest gaps).
 *
 * `ops.notifications` is the **fan-out mountain**: bus → durable inbox →
 * per-channel delivery rows. That machinery ships and delivers **in-app**.
 *
 * Out-of-app transports (email / push / SMS) are **not** closed by the mountain.
 * Each is a Doctrine §13 credential socket. Adapters exist and refuse by name
 * when credentials are unset — we do **not** invent providers (§0.7). Closing a
 * socket is Class X owner work (`docs/OWNER-ACTIONS-NOTIFY-GATEWAYS.md`).
 *
 * This module is the machine-checkable split so a green fan-out suite cannot be
 * misread as "email/push/SMS deliver in every deploy."
 */

import { OUT_OF_APP_CHANNELS, type ChannelId, type OutOfAppChannel } from './channel.js';

/** Tracker id for the fan-out mountain (not a §13 socket). */
export const FANOUT_MOUNTAIN_ID = 'ops.notifications' as const;

/** §13 socket tracker ids — one per out-of-app channel. */
export const NOTIFY_CHANNEL_SOCKET_IDS = ['socket.notify-email', 'socket.notify-push', 'socket.notify-sms'] as const;

export type NotifyChannelSocketId = (typeof NOTIFY_CHANNEL_SOCKET_IDS)[number];

/** Out-of-app channel → §13 socket. `inapp` has no socket (mountain surface). */
export const CHANNEL_TO_SOCKET = {
  email: 'socket.notify-email',
  push: 'socket.notify-push',
  sms: 'socket.notify-sms',
} as const satisfies Record<OutOfAppChannel, NotifyChannelSocketId>;

/** Named honest gaps — codes, not marketing copy. */
export const HONEST_GAPS = [
  'gap.class_x_credentials',
  'gap.mountain_not_done_while_ooa_refuse',
  'gap.no_provider_invent',
  'gap.accepted_is_not_delivered',
] as const;

export type HonestGapId = (typeof HONEST_GAPS)[number];

/** §13 socket for an out-of-app channel; null for `inapp` (mountain-only). */
export function socketIdForChannel(channel: ChannelId): NotifyChannelSocketId | null {
  if (channel === 'inapp') return null;
  return CHANNEL_TO_SOCKET[channel];
}

/** Channel for a known notify §13 socket; null if unknown. */
export function channelForSocketId(socketId: string): OutOfAppChannel | null {
  for (const id of OUT_OF_APP_CHANNELS) {
    if (CHANNEL_TO_SOCKET[id] === socketId) return id;
  }
  return null;
}

export function isNotifyChannelSocketId(value: string): value is NotifyChannelSocketId {
  return (NOTIFY_CHANNEL_SOCKET_IDS as readonly string[]).includes(value);
}

/** Every out-of-app channel maps 1:1 onto a distinct §13 socket. */
export function channelSocketMatrixComplete(): boolean {
  if (OUT_OF_APP_CHANNELS.length !== NOTIFY_CHANNEL_SOCKET_IDS.length) return false;
  const seen = new Set<string>();
  for (const id of OUT_OF_APP_CHANNELS) {
    const sock = CHANNEL_TO_SOCKET[id];
    if (!isNotifyChannelSocketId(sock)) return false;
    if (seen.has(sock)) return false;
    seen.add(sock);
  }
  return seen.size === NOTIFY_CHANNEL_SOCKET_IDS.length;
}

/**
 * Mountain Done bar honesty: fan-out may be `ready` while sockets stay open.
 * Flipping the mountain to `done` while every out-of-app channel still refuses
 * in real deploys is forbidden (tracker + TRK pack).
 */
export function mountainDoneForbiddenWhileAllOutOfAppRefuse(allOutOfAppRefuseInDeploy: boolean): boolean {
  return allOutOfAppRefuseInDeploy;
}

export function mountainVsSocketsBoardCard(): {
  readonly mountain: typeof FANOUT_MOUNTAIN_ID;
  readonly sockets: number;
  readonly outOfApp: number;
  readonly gaps: number;
  readonly matrixComplete: boolean;
  readonly inappHasNoSocket: boolean;
} {
  return {
    mountain: FANOUT_MOUNTAIN_ID,
    sockets: NOTIFY_CHANNEL_SOCKET_IDS.length,
    outOfApp: OUT_OF_APP_CHANNELS.length,
    gaps: HONEST_GAPS.length,
    matrixComplete: channelSocketMatrixComplete(),
    inappHasNoSocket: socketIdForChannel('inapp') === null,
  };
}

export function mountainVsSocketsStatusLine(): string {
  const c = mountainVsSocketsBoardCard();
  return (
    `mountain=${c.mountain} sockets=${c.sockets} outOfApp=${c.outOfApp} ` +
    `gaps=${c.gaps} matrix=${c.matrixComplete ? '1' : '0'} inappSocket=${c.inappHasNoSocket ? '0' : '1'}`
  );
}

export function parseMountainVsSocketsStatusLine(line: string): {
  readonly mountain: string;
  readonly sockets: number;
  readonly outOfApp: number;
  readonly gaps: number;
  readonly matrix: boolean;
  readonly inappHasSocket: boolean;
} | null {
  const m = line.trim().match(/^mountain=([a-z0-9.]+) sockets=(\d+) outOfApp=(\d+) gaps=(\d+) matrix=([01]) inappSocket=([01])$/);
  if (!m) return null;
  return {
    mountain: m[1]!,
    sockets: Number(m[2]),
    outOfApp: Number(m[3]),
    gaps: Number(m[4]),
    matrix: m[5] === '1',
    inappHasSocket: m[6] === '1',
  };
}

export function mountainVsSocketsStatusLineMatches(): boolean {
  const p = parseMountainVsSocketsStatusLine(mountainVsSocketsStatusLine());
  if (!p) return false;
  const c = mountainVsSocketsBoardCard();
  return (
    p.mountain === c.mountain &&
    p.sockets === c.sockets &&
    p.outOfApp === c.outOfApp &&
    p.gaps === c.gaps &&
    p.matrix === c.matrixComplete &&
    p.inappHasSocket === !c.inappHasNoSocket
  );
}

export function mountainVsSocketsExportHeader(): string {
  return 'channel,plane,socket';
}

export function mountainVsSocketsExportLines(): readonly string[] {
  return ['inapp,mountain,', ...OUT_OF_APP_CHANNELS.map((id) => `${id},socket,${CHANNEL_TO_SOCKET[id]}`)];
}

export function mountainVsSocketsExportText(): string {
  return [mountainVsSocketsExportHeader(), ...mountainVsSocketsExportLines()].join('\n');
}

export function isDeclaredHonestGap(id: string): boolean {
  return (HONEST_GAPS as readonly string[]).includes(id);
}
