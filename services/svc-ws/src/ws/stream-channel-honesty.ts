/**
 * WS L3 — pure stream-channel catalog honesty (structural only).
 *
 * Mirrors gateway.ts StreamChannel: depth | trades.
 * Does not invent market data or money fields.
 */

export const STREAM_CHANNELS = ['depth', 'trades'] as const;
export type StreamChannelId = (typeof STREAM_CHANNELS)[number];

/** L3 — catalog board. */
export function streamChannelCatalogBoardCard(): {
  readonly channels: number;
  readonly hasDepth: number;
  readonly hasTrades: number;
} {
  return {
    channels: STREAM_CHANNELS.length,
    hasDepth: STREAM_CHANNELS.includes('depth') ? 1 : 0,
    hasTrades: STREAM_CHANNELS.includes('trades') ? 1 : 0,
  };
}

/** L3 — status line. */
export function streamChannelCatalogStatusLine(): string {
  const c = streamChannelCatalogBoardCard();
  return `channels=${c.channels} depth=${c.hasDepth} trades=${c.hasTrades}`;
}

/** L3 — parse status. */
export function parseStreamChannelCatalogStatusLine(line: string): {
  readonly channels: number;
  readonly depth: number;
  readonly trades: number;
} | null {
  const m = line.trim().match(/^channels=(\d+) depth=([01]) trades=([01])$/);
  if (!m) return null;
  return {
    channels: Number(m[1]),
    depth: Number(m[2]),
    trades: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function streamChannelCatalogStatusLineMatches(): boolean {
  const p = parseStreamChannelCatalogStatusLine(streamChannelCatalogStatusLine());
  if (!p) return false;
  const c = streamChannelCatalogBoardCard();
  return p.channels === c.channels && p.depth === c.hasDepth && p.trades === c.hasTrades;
}

/** L3 — two channels declared. */
export function streamChannelCatalogStatusLineConsistent(line: string): boolean {
  const p = parseStreamChannelCatalogStatusLine(line);
  if (!p) return false;
  return p.channels === 2 && p.depth === 1 && p.trades === 1;
}

/** L3 — export header. */
export function streamChannelCatalogExportHeader(): string {
  return 'stream_channel';
}

/** L3 — export lines. */
export function streamChannelCatalogExportLines(): readonly string[] {
  return [...STREAM_CHANNELS];
}

/** L3 — full export. */
export function streamChannelCatalogExportText(): string {
  return [streamChannelCatalogExportHeader(), ...streamChannelCatalogExportLines()].join('\n');
}

/** L3 — channel declared. */
export function isDeclaredStreamChannel(ch: string): boolean {
  return (STREAM_CHANNELS as readonly string[]).includes(ch);
}
