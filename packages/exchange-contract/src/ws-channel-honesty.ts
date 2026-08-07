/**
 * Exchange-contract L3 — pure WS channel catalog honesty (structural only).
 *
 * Mirrors api.ts WS_CHANNELS keys (public + private).
 * Does not invent money balance projections.
 */

export const WS_CHANNEL_IDS = ['orderbook', 'trades', 'ticker', 'ohlcv', 'orders', 'positions', 'balance'] as const;
export type WsChannelId = (typeof WS_CHANNEL_IDS)[number];

export const WS_PUBLIC_CHANNELS = ['orderbook', 'trades', 'ticker', 'ohlcv'] as const;
export const WS_PRIVATE_CHANNELS = ['orders', 'positions', 'balance'] as const;

/** L3 — catalog board. */
export function wsChannelCatalogBoardCard(): {
  readonly channels: number;
  readonly publicCount: number;
  readonly privateCount: number;
  readonly hasOrderbook: number;
  readonly hasBalance: number;
} {
  return {
    channels: WS_CHANNEL_IDS.length,
    publicCount: WS_PUBLIC_CHANNELS.length,
    privateCount: WS_PRIVATE_CHANNELS.length,
    hasOrderbook: WS_CHANNEL_IDS.includes('orderbook') ? 1 : 0,
    hasBalance: WS_CHANNEL_IDS.includes('balance') ? 1 : 0,
  };
}

/** L3 — status line. */
export function wsChannelCatalogStatusLine(): string {
  const c = wsChannelCatalogBoardCard();
  return `channels=${c.channels} public=${c.publicCount} private=${c.privateCount} orderbook=${c.hasOrderbook} balance=${c.hasBalance}`;
}

/** L3 — parse status. */
export function parseWsChannelCatalogStatusLine(line: string): {
  readonly channels: number;
  readonly public: number;
  readonly private: number;
  readonly orderbook: number;
  readonly balance: number;
} | null {
  const m = line.trim().match(/^channels=(\d+) public=(\d+) private=(\d+) orderbook=([01]) balance=([01])$/);
  if (!m) return null;
  return {
    channels: Number(m[1]),
    public: Number(m[2]),
    private: Number(m[3]),
    orderbook: Number(m[4]),
    balance: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function wsChannelCatalogStatusLineMatches(): boolean {
  const p = parseWsChannelCatalogStatusLine(wsChannelCatalogStatusLine());
  if (!p) return false;
  const c = wsChannelCatalogBoardCard();
  return (
    p.channels === c.channels &&
    p.public === c.publicCount &&
    p.private === c.privateCount &&
    p.orderbook === c.hasOrderbook &&
    p.balance === c.hasBalance
  );
}

/** L3 — seven channels; 4 public + 3 private. */
export function wsChannelCatalogStatusLineConsistent(line: string): boolean {
  const p = parseWsChannelCatalogStatusLine(line);
  if (!p) return false;
  return p.channels === 7 && p.public === 4 && p.private === 3 && p.orderbook === 1 && p.balance === 1;
}

/** L3 — export header. */
export function wsChannelCatalogExportHeader(): string {
  return 'ws_channel';
}

/** L3 — export lines. */
export function wsChannelCatalogExportLines(): readonly string[] {
  return [...WS_CHANNEL_IDS];
}

/** L3 — full export. */
export function wsChannelCatalogExportText(): string {
  return [wsChannelCatalogExportHeader(), ...wsChannelCatalogExportLines()].join('\n');
}

/** L3 — channel declared. */
export function isDeclaredWsChannel(ch: string): boolean {
  return (WS_CHANNEL_IDS as readonly string[]).includes(ch);
}
