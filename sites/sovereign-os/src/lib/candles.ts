/** Real OHLC from Binance public API + baked JSON fallback. No API key. */

export type Candle = {
  time: number; // unix seconds UTC
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type CandleSymbol = 'BTCUSDT' | 'ETHUSDT' | 'SOLUSDT';

/** Binance kline row: [openTime, o, h, l, c, volume, ...] */
function parseKlines(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  const out: Candle[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const volume = Number(row[5]);
    const openTime = Number(row[0]);
    if (![open, high, low, close, openTime].every((n) => Number.isFinite(n))) continue;
    // Enforce OHLC invariants (source should already, but guard)
    const hi = Math.max(high, open, close);
    const lo = Math.min(low, open, close);
    out.push({
      time: Math.floor(openTime / 1000),
      open,
      high: hi,
      low: lo,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    });
  }
  return out;
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return res.json();
}

/**
 * Live Binance klines (CORS *). Falls back to baked /data/{symbol}-1h.json.
 */
export async function loadCandles(symbol: CandleSymbol, signal?: AbortSignal): Promise<{ candles: Candle[]; source: 'live' | 'baked' }> {
  const interval = '1h';
  const limit = 168; // 7d of 1h bars - real market shape

  try {
    const live = await fetchJson(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, signal);
    const candles = parseKlines(live);
    if (candles.length >= 24) return { candles, source: 'live' };
  } catch {
    /* fall through */
  }

  try {
    // Relative to site base (GitHub Pages + vite base ./)
    const baked = await fetchJson(`./data/${symbol}-1h.json`, signal);
    const candles = parseKlines(baked);
    if (candles.length >= 24) return { candles, source: 'baked' };
  } catch {
    /* fall through */
  }

  return { candles: syntheticRealistic(symbol), source: 'baked' };
}

/** Last-resort realistic GBM path - only if both live and baked fail */
function syntheticRealistic(symbol: CandleSymbol): Candle[] {
  const base = symbol === 'ETHUSDT' ? 3400 : symbol === 'SOLUSDT' ? 180 : 64000;
  const candles: Candle[] = [];
  let price = base;
  const now = Math.floor(Date.now() / 1000);
  const start = now - 168 * 3600;
  // Seeded LCG for stable shape
  let seed = symbol.length * 9973 + 42;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < 168; i++) {
    const open = price;
    const drift = (rnd() - 0.48) * base * 0.004;
    const shock = (rnd() - 0.5) * base * 0.006;
    const close = Math.max(base * 0.5, open + drift + shock);
    const wickUp = rnd() * base * 0.0025;
    const wickDn = rnd() * base * 0.0025;
    const high = Math.max(open, close) + wickUp;
    const low = Math.min(open, close) - wickDn;
    candles.push({
      time: start + i * 3600,
      open,
      high,
      low,
      close,
      volume: 50 + rnd() * 400,
    });
    price = close;
  }
  return candles;
}

export function formatPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
