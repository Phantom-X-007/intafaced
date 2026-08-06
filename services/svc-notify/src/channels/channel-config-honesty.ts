/**
 * Notify L3 — pure channel config honesty boards (no gateway I/O).
 *
 * Mirrors registry/channel shapes: configured vs unconfigured out-of-app.
 * Does not invent credentials or send.
 */

export type ChannelConfigBoardInput = {
  readonly id: 'in_app' | 'email' | 'push' | 'sms';
  readonly configured: boolean;
  readonly required: boolean;
};

/** L3 — total channels. */
export function channelConfigCount(channels: readonly ChannelConfigBoardInput[]): number {
  return channels.length;
}

/** L3 — configured out-of-app (email/push/sms with configured=true). */
export function configuredOutOfAppCount(channels: readonly ChannelConfigBoardInput[]): number {
  return channels.filter((c) => c.id !== 'in_app' && c.configured).length;
}

/** L3 — unconfigured out-of-app. */
export function unconfiguredOutOfAppCount(channels: readonly ChannelConfigBoardInput[]): number {
  return channels.filter((c) => c.id !== 'in_app' && !c.configured).length;
}

/** L3 — required but unconfigured (fatal class on boot; board only here). */
export function requiredUnconfiguredCount(channels: readonly ChannelConfigBoardInput[]): number {
  return channels.filter((c) => c.required && !c.configured).length;
}

/** L3 — board card. */
export function channelConfigBoardCard(channels: readonly ChannelConfigBoardInput[]): {
  readonly channels: number;
  readonly configured: number;
  readonly unconfigured: number;
  readonly requiredUnconfigured: number;
  readonly inAppPresent: boolean;
} {
  return {
    channels: channels.length,
    configured: channels.filter((c) => c.configured).length,
    unconfigured: channels.filter((c) => !c.configured).length,
    requiredUnconfigured: requiredUnconfiguredCount(channels),
    inAppPresent: channels.some((c) => c.id === 'in_app'),
  };
}

/** L3 — status line. */
export function channelConfigStatusLine(channels: readonly ChannelConfigBoardInput[]): string {
  const c = channelConfigBoardCard(channels);
  return `channels=${c.channels} configured=${c.configured} unconfigured=${c.unconfigured} required_unconfigured=${c.requiredUnconfigured} in_app=${c.inAppPresent ? 1 : 0}`;
}

/** L3 — parse status. Invalid → null. */
export function parseChannelConfigStatusLine(line: string): {
  readonly channels: number;
  readonly configured: number;
  readonly unconfigured: number;
  readonly requiredUnconfigured: number;
  readonly inApp: number;
} | null {
  const m = line.trim().match(/^channels=(\d+) configured=(\d+) unconfigured=(\d+) required_unconfigured=(\d+) in_app=([01])$/);
  if (!m) return null;
  return {
    channels: Number(m[1]),
    configured: Number(m[2]),
    unconfigured: Number(m[3]),
    requiredUnconfigured: Number(m[4]),
    inApp: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function channelConfigStatusLineMatches(channels: readonly ChannelConfigBoardInput[]): boolean {
  const p = parseChannelConfigStatusLine(channelConfigStatusLine(channels));
  if (!p) return false;
  const c = channelConfigBoardCard(channels);
  return (
    p.channels === c.channels &&
    p.configured === c.configured &&
    p.unconfigured === c.unconfigured &&
    p.requiredUnconfigured === c.requiredUnconfigured &&
    p.inApp === (c.inAppPresent ? 1 : 0)
  );
}

/** L3 — true when configured+unconfigured equals channels. */
export function channelConfigStatusLineConsistent(line: string): boolean {
  const p = parseChannelConfigStatusLine(line);
  if (!p) return false;
  return p.channels === p.configured + p.unconfigured && p.requiredUnconfigured <= p.unconfigured;
}

/** L3 — export header. */
export function channelConfigExportHeader(): string {
  return 'channels,configured,unconfigured,required_unconfigured,in_app';
}

/** L3 — export line. */
export function channelConfigExportLine(channels: readonly ChannelConfigBoardInput[]): string {
  const c = channelConfigBoardCard(channels);
  return `${c.channels},${c.configured},${c.unconfigured},${c.requiredUnconfigured},${c.inAppPresent ? 1 : 0}`;
}

/** L3 — full export. */
export function channelConfigExportText(channels: readonly ChannelConfigBoardInput[]): string {
  return [channelConfigExportHeader(), channelConfigExportLine(channels)].join('\n');
}

/** L3 — true when no required gaps. */
export function channelConfigRequiredReady(channels: readonly ChannelConfigBoardInput[]): boolean {
  return requiredUnconfiguredCount(channels) === 0;
}

/** L3 — count in range. */
export function channelConfigCountInRange(channels: readonly ChannelConfigBoardInput[], min: number, max: number): boolean {
  if (min > max) return false;
  const n = channels.length;
  return n >= min && n <= max;
}
