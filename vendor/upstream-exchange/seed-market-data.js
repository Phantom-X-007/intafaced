/* =============================================================================
   INTAFACED - market history seeder for the vendored CoinExchange (bitrade)
   -----------------------------------------------------------------------------
   WHY THIS EXISTS

   The market service builds every price it publishes from matched trades. With
   no matching engine traffic there are no trades, so `KLineGeneratorJob` writes
   candles of all zeros, `initializeThumb()` finds nothing to summarise, and the
   whole exchange renders as an empty frame with 0.00 in every cell.

   This script writes the history that a running exchange would have produced,
   directly into the collections the market service already reads:

     exchange_kline_<SYMBOL>_<period>   one document per candle  (KLine)
     exchange_trade_<SYMBOL>            one document per fill    (ExchangeTrade)

   Shapes are taken from the entity classes, not guessed:
     00_framework/exchange-core/src/main/java/com/bizzan/bitrade/entity/KLine.java
     00_framework/exchange-core/src/main/java/com/bizzan/bitrade/entity/ExchangeTrade.java
   and from what Spring Data actually stored in this database: every BigDecimal
   field is persisted as a STRING, `time` as a 64-bit integer, `count` as int32.

   -----------------------------------------------------------------------------
   MONEY

   No price, amount or turnover is ever a JavaScript number in this script.
   Every one of them is a scaled BigInt (12 decimal places internally) and is
   rendered to a fixed-scale decimal string on the way out, matching the
   BigDecimal the Java side will read back.

   Floating point is used for exactly one thing: drawing the random numbers that
   shape the walk (returns, wick sizes, activity multipliers). Those are
   dimensionless statistics, not money - they are converted to scaled BigInt
   multipliers before they ever touch a price.

   -----------------------------------------------------------------------------
   CANDLE TIMESTAMPS ARE PERIOD END, NOT PERIOD START

   `DefaultCoinProcessor.generateKLine(range, field, time)` collects the trades
   in [time - range, time] and stores the candle at `time`. `autoGenerate()` does
   the same for the 1min candle. So a bar labelled 12:05 covers 12:00 -> 12:05.
   That is the opposite of the usual TradingView convention, but it is what the
   running service will keep appending, so the seed follows it. Mixing the two
   would put a one-period step in the chart at the point the seed ends.

   -----------------------------------------------------------------------------
   RUN

     node vendor/upstream-exchange/seed-market-data.mjs            (recommended)

   or straight into the container:

     docker cp vendor/upstream-exchange/seed-market-data.js intafaced-coinex-mongo:/tmp/
     docker exec intafaced-coinex-mongo mongosh bitrade --quiet --file /tmp/seed-market-data.js

   The script is idempotent: it clears every collection it is about to write
   before writing it, so re-running produces one clean history, not two stacked
   ones. The random walk is seeded, so a re-run with the same MARKET_SEED
   reproduces the same shape (anchored to the new "now").

   Environment overrides:
     MARKET_SEED          integer seed for the walk        (default 20260729)
     MARKET_SEED_DAYS     days of hourly history           (default 365)
     MARKET_SEED_MIN_DAYS days of minute history           (default 7)
     MARKET_SEED_SYMBOLS  comma-separated subset to seed   (default all)
   ========================================================================== */

/* ── configuration ─────────────────────────────────────────────────────────── */

/* priceScale / amountScale mirror `exchange_coin`.`base_coin_scale` and
   `coin_scale` in MySQL. They decide how many decimals the stored decimal
   strings carry, so a seeded price is representable as a real order price.

   price       - plausible level for the pair, as a decimal string.
   dailyVol    - standard deviation of daily log returns. BTC ~2.8%/day is
                 roughly its realised vol; the small caps carry more.
   baseVolume  - typical coin volume traded per minute, decimal string. Sized so
                 the 24h turnover lands where a venue of this size would be:
                 ~1.0B USDT/day on BTC down to ~25M on MATIC.
   baseCount   - typical number of fills per minute. */
const SYMBOLS = [
  { symbol: 'BTC/USDT',   priceScale: 2, amountScale: 6, price: '118450.00',  dailyVol: 0.028, baseVolume: '5.9',    baseCount: 180 },
  { symbol: 'ETH/USDT',   priceScale: 2, amountScale: 5, price: '3865.40',    dailyVol: 0.036, baseVolume: '90',     baseCount: 150 },
  { symbol: 'SOL/USDT',   priceScale: 2, amountScale: 3, price: '178.62',     dailyVol: 0.052, baseVolume: '970',    baseCount: 120 },
  { symbol: 'XRP/USDT',   priceScale: 4, amountScale: 1, price: '2.3140',     dailyVol: 0.048, baseVolume: '54000',  baseCount: 95 },
  { symbol: 'BNB/USDT',   priceScale: 2, amountScale: 4, price: '692.30',     dailyVol: 0.031, baseVolume: '90',     baseCount: 70 },
  { symbol: 'DOGE/USDT',  priceScale: 5, amountScale: 0, price: '0.18240',    dailyVol: 0.061, baseVolume: '420000', baseCount: 85 },
  { symbol: 'ADA/USDT',   priceScale: 4, amountScale: 1, price: '0.7185',     dailyVol: 0.054, baseVolume: '68000',  baseCount: 60 },
  { symbol: 'AVAX/USDT',  priceScale: 3, amountScale: 3, price: '26.480',     dailyVol: 0.058, baseVolume: '1180',   baseCount: 45 },
  { symbol: 'LINK/USDT',  priceScale: 3, amountScale: 2, price: '16.845',     dailyVol: 0.055, baseVolume: '2060',   baseCount: 48 },
  { symbol: 'MATIC/USDT', priceScale: 4, amountScale: 1, price: '0.2917',     dailyVol: 0.063, baseVolume: '60000',  baseCount: 35 },
];

/* Periods the market service reads. The controller maps a TradingView
   resolution onto these names in MarketController.findKHistory:
     "1"->1min  "5"->5min  "15"->15min  "30"->30min  "60"->1hour
     "240"->4hour  "1D"->1day  "1W"->1week  "1M"->1month
   10min is not reachable from the chart but KLineGeneratorJob writes it, so it
   is seeded too rather than left as a pocket of zeros. */
const MINUTE_PERIODS = [
  { name: '1min',  ms: 60 * 1000 },
  { name: '5min',  ms: 5 * 60 * 1000 },
  { name: '10min', ms: 10 * 60 * 1000 },
  { name: '15min', ms: 15 * 60 * 1000 },
  { name: '30min', ms: 30 * 60 * 1000 },
];
const HOUR_PERIODS = [
  { name: '1hour', ms: 60 * 60 * 1000 },
  { name: '4hour', ms: 4 * 60 * 60 * 1000 },
  { name: '1day',  ms: 24 * 60 * 60 * 1000 },
  { name: '1week', kind: 'week' },
  { name: '1month', kind: 'month' },
];

const MS_MINUTE = 60 * 1000;
const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * 60 * 60 * 1000;

/* Recent trade tape. Three hours is deliberate: the hourly KLineGeneratorJob
   rebuilds its candle from `findTradeByTimeRange(symbol, now-1h, now)`, so the
   first hourly candle the live service writes after this seed still has fills
   to work from instead of falling back to a flat bar. */
const TRADE_WINDOW_MS = 3 * MS_HOUR;
const TRADES_PER_MINUTE = 3;

const KLINE_CLASS = 'com.bizzan.bitrade.entity.KLine';
const TRADE_CLASS = 'com.bizzan.bitrade.entity.ExchangeTrade';
const INSERT_BATCH = 5000;

const env = (typeof process !== 'undefined' && process.env) || {};
const SEED = Number(env.MARKET_SEED || 20260729);
const HISTORY_DAYS = Number(env.MARKET_SEED_DAYS || 365);
const MINUTE_DAYS = Number(env.MARKET_SEED_MIN_DAYS || 7);
const ONLY = (env.MARKET_SEED_SYMBOLS || '').split(',').map((s) => s.trim()).filter(Boolean);

/* ── fixed-point money ─────────────────────────────────────────────────────── */

/* Everything monetary is carried at 12 decimal places as a BigInt. 12 is
   comfortably wider than the widest scale any pair here uses (5), so rounding
   happens once, at render time, and never accumulates through the walk. */
const SCALE = 12;
const ONE = 10n ** BigInt(SCALE);

/** Parse a decimal string into a BigInt scaled by 10^SCALE. Rejects anything
 *  that is not a plain non-negative decimal - a silently-coerced NaN here would
 *  become a zero price on a chart. */
function parseDecimal(text) {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(String(text));
  if (!m) throw new Error('not a decimal literal: ' + text);
  const frac = (m[2] || '').slice(0, SCALE).padEnd(SCALE, '0');
  return BigInt(m[1]) * ONE + BigInt(frac || '0');
}

/** Render a scaled BigInt as a fixed-scale decimal string, half-up. */
function formatDecimal(scaled, outScale) {
  if (scaled < 0n) throw new Error('negative money: ' + scaled);
  const shift = BigInt(SCALE - outScale);
  const div = 10n ** shift;
  let units = scaled / div;
  if ((scaled % div) * 2n >= div) units += 1n;
  const digits = units.toString().padStart(outScale + 1, '0');
  if (outScale === 0) return digits;
  return digits.slice(0, digits.length - outScale) + '.' + digits.slice(digits.length - outScale);
}

/** a * b / ONE - the only way a price is ever multiplied in this file. */
function mul(a, b) {
  return (a * b) / ONE;
}

/** Turn a plain number into a scaled BigInt multiplier. Used for the random
 *  draws (returns, wick sizes, activity), never for a price. */
function toScaled(n) {
  if (!Number.isFinite(n)) throw new Error('non-finite multiplier: ' + n);
  return BigInt(Math.round(n * Number(ONE)));
}

/* ── deterministic randomness ──────────────────────────────────────────────── */

/* mulberry32 - small, fast, good enough for market cosmetics, and above all
   reproducible: the same MARKET_SEED and the same symbol give the same shape. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Box-Muller, clamped. A six-sigma minute candle is not realism, it is a
 *  rendering accident that flattens every other bar on the chart. */
function makeGauss(rng) {
  return function gauss() {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.max(-3.5, Math.min(3.5, g));
  };
}

/* ── the walk ──────────────────────────────────────────────────────────────── */

/* Crypto is a 24/7 market but it is not a uniform one: European and US hours
   carry most of the flow. This scales both volatility and volume across the
   UTC day so a minute chart has quiet stretches and busy ones instead of an
   even band of noise. Peak near 15:00 UTC, trough near 03:00. */
const SEASON_AMP = 0.28;
const SEASON_PEAK_HOUR = 15;
/* Mean 1 by construction, so E[season^2] = 1 + amp^2/2. The calibration below
   needs it: scaling the shock by a factor with mean 1 still raises variance. */
const SEASON_VAR = 1 + (SEASON_AMP * SEASON_AMP) / 2;

function sessionFactor(timeMs) {
  const hour = (timeMs % MS_DAY) / MS_HOUR;
  return 1 + SEASON_AMP * Math.cos((2 * Math.PI * (hour - SEASON_PEAK_HOUR)) / 24);
}

/* Fraction of a day's price variance that comes from the persistent trend term
   rather than from independent shocks. Above ~0.3 the series reads as a series
   of ramps; at 0 it reads as static. */
const DRIFT_SHARE = 0.22;

/** Variance of an AR(1) path summed over `n` steps, in units of that process's
 *  stationary variance. Sum_{i,j} p^|i-j|. This is the whole reason the first
 *  cut of this seeder produced 20%-a-day candles: a persistent term summed over
 *  a day contributes hundreds of times its own variance, not n times it. */
function ar1SumVariance(n, p) {
  let total = n;
  for (let k = 1; k < n; k++) total += 2 * (n - k) * Math.pow(p, k);
  return total;
}

/**
 * Build `count` candles ending at `endTime`, each covering `stepMs`.
 *
 * The return is drift + shock. The drift is an AR(1) process rather than a
 * constant, which is what gives the series multi-day trends and reversals. A
 * pure random walk reads as noise and a constant drift reads as a ramp; neither
 * is worth putting on a chart.
 *
 * OHLC invariants hold by construction: the wicks are grown outward from
 * max(open, close) and min(open, close), so low <= open,close <= high always.
 *
 * Prices come back unscaled to any particular level - the caller normalises the
 * whole path at the end so it lands on the configured current price. Scaling a
 * multiplicative path by a constant preserves every return in it.
 */
function buildCandles(cfg, rng, gauss, startPrice, stepMs, count, endTime) {
  /* Persistence tuned so the trend half-life is days, not minutes:
     ~5.8 days at hourly steps, ~23 hours at minute steps. */
  const persistence = stepMs >= MS_HOUR ? 0.995 : 0.9995;
  const stepsPerDay = MS_DAY / stepMs;

  /* Calibrate both terms so that the realised daily volatility of the finished
     series is cfg.dailyVol, whatever the step size - a 1min walk and a 1h walk
     of the same asset must describe the same asset. The shock carries
     (1 - DRIFT_SHARE) of the daily variance, the trend the rest. */
  const sigmaStep = cfg.dailyVol * Math.sqrt(((1 - DRIFT_SHARE) * stepMs) / (MS_DAY * SEASON_VAR));
  const driftStationary = cfg.dailyVol * Math.sqrt(DRIFT_SHARE / ar1SumVariance(stepsPerDay, persistence));
  const driftSigma = driftStationary * Math.sqrt(1 - persistence * persistence);
  const driftCap = driftStationary * 3;

  const baseVolume = parseDecimal(cfg.baseVolume);
  const stepMinutes = stepMs / MS_MINUTE;

  const bars = [];
  let price = startPrice;
  let drift = 0;

  for (let i = 0; i < count; i++) {
    const time = endTime - (count - 1 - i) * stepMs;
    const season = sessionFactor(time - stepMs);

    drift = drift * persistence + gauss() * driftSigma;
    if (drift > driftCap) drift = driftCap;
    if (drift < -driftCap) drift = -driftCap;

    const ret = drift + sigmaStep * season * gauss();
    const open = price;
    const close = mul(open, toScaled(Math.exp(ret)));
    if (close <= 0n) throw new Error('walk went non-positive');

    const top = close > open ? close : open;
    const bottom = close > open ? open : close;
    const wick = sigmaStep * season * (0.35 + 0.75 * rng());
    const high = mul(top, toScaled(1 + Math.abs(gauss()) * wick * 0.5));
    const low = mul(bottom, toScaled(1 / (1 + Math.abs(gauss()) * wick * 0.5)));
    if (low > bottom || high < top || low <= 0n) throw new Error('OHLC invariant broken');

    /* Volume follows range: a wide bar is a busy bar. The ratio is a plain
       number because it is a shape statistic, but it is converted to a scaled
       multiplier before it is applied to the volume, which stays a BigInt. */
    const spread = Number(high - low) / Number(open);
    const activity = Math.max(0.15, Math.min(4, 0.35 + 0.55 * (spread / Math.max(sigmaStep, 1e-9))));
    const jitter = 0.7 + 0.6 * rng();
    const volume = mul(baseVolume, toScaled(activity * season * jitter * stepMinutes));
    const count_ = Math.max(1, Math.round(cfg.baseCount * activity * season * jitter * stepMinutes));

    bars.push({ time: time, open: open, high: high, low: low, close: close, volume: volume, count: count_ });
    price = close;
  }
  return bars;
}

/* ── aggregation ───────────────────────────────────────────────────────────── */

/* Higher intervals are aggregated from the base series rather than walked
   separately. Independent walks per interval would disagree with each other -
   the 1h chart would not be the 1m chart zoomed out - and that is exactly the
   kind of detail that reads as fake. */

/** Ascending list of period-end boundaries strictly inside (fromMs, toMs]. */
function boundaries(period, fromMs, toMs) {
  const out = [];
  if (period.kind === 'week') {
    /* KLineGeneratorJob writes the weekly candle at Sunday 00:00 UTC.
       1970-01-04 was the first Sunday: 3 days into the epoch. */
    const WEEK = 7 * MS_DAY;
    const OFFSET = 3 * MS_DAY;
    let t = Math.ceil((fromMs - OFFSET) / WEEK) * WEEK + OFFSET;
    for (; t <= toMs; t += WEEK) out.push(t);
    return out;
  }
  if (period.kind === 'month') {
    const d = new Date(fromMs);
    let y = d.getUTCFullYear();
    let m = d.getUTCMonth();
    let t = Date.UTC(y, m, 1);
    while (t < fromMs) {
      m += 1;
      if (m > 11) { m = 0; y += 1; }
      t = Date.UTC(y, m, 1);
    }
    while (t <= toMs) {
      out.push(t);
      m += 1;
      if (m > 11) { m = 0; y += 1; }
      t = Date.UTC(y, m, 1);
    }
    return out;
  }
  let t = Math.ceil(fromMs / period.ms) * period.ms;
  for (; t <= toMs; t += period.ms) out.push(t);
  return out;
}

/**
 * Roll `bars` (each covering `stepMs` and labelled at its end) up into `period`.
 * A bucket is emitted only when every sub-bar inside it is present, so the
 * partial bucket at each end of the range is dropped rather than published as a
 * short candle - a half-filled daily bar is a visible lie about the day.
 */
function aggregate(bars, stepMs, period) {
  if (bars.length === 0) return [];
  const byTime = new Map();
  for (const bar of bars) byTime.set(bar.time, bar);

  const first = bars[0].time - stepMs;
  const last = bars[bars.length - 1].time;
  const marks = boundaries(period, first, last);

  const out = [];
  for (let i = 0; i < marks.length; i++) {
    const end = marks[i];
    const start = i === 0 ? null : marks[i - 1];
    if (start === null) continue;
    if (start < first) continue;

    let open = null;
    let high = null;
    let low = null;
    let close = null;
    let volume = 0n;
    let count = 0;
    let complete = true;

    for (let t = start + stepMs; t <= end; t += stepMs) {
      const bar = byTime.get(t);
      if (!bar) { complete = false; break; }
      if (open === null) { open = bar.open; high = bar.high; low = bar.low; }
      if (bar.high > high) high = bar.high;
      if (bar.low < low) low = bar.low;
      close = bar.close;
      volume += bar.volume;
      count += bar.count;
    }
    if (!complete || open === null) continue;
    out.push({ time: end, open: open, high: high, low: low, close: close, volume: volume, count: count });
  }
  return out;
}

/* ── documents ─────────────────────────────────────────────────────────────── */

/** Turnover is derived, not walked: volume times the candle's typical price.
 *  Deriving it keeps turnover/volume consistent with the price level after the
 *  whole path has been normalised. */
function turnoverOf(bar) {
  const typical = (bar.open + bar.high + bar.low + bar.close) / 4n;
  return mul(bar.volume, typical);
}

function klineDoc(cfg, bar, periodName) {
  const volumeScale = Math.max(cfg.amountScale, 4);
  return {
    _class: KLINE_CLASS,
    openPrice: formatDecimal(bar.open, cfg.priceScale),
    highestPrice: formatDecimal(bar.high, cfg.priceScale),
    lowestPrice: formatDecimal(bar.low, cfg.priceScale),
    closePrice: formatDecimal(bar.close, cfg.priceScale),
    time: Long(String(bar.time)),
    period: periodName,
    count: Int32(bar.count),
    volume: formatDecimal(bar.volume, volumeScale),
    turnover: formatDecimal(turnoverOf(bar), 8),
  };
}

/**
 * A recent tape of fills, walked inside the minute candles that are already
 * fixed, so the tape and the chart agree. Prices stay within [low, high] of
 * the minute they belong to and the last fill of a minute is that minute's
 * close, which is exactly the relationship the matching engine produces.
 */
function buildTrades(cfg, minuteBars, rng, gauss, nowMs) {
  const fromMs = nowMs - TRADE_WINDOW_MS;
  const window = minuteBars.filter((b) => b.time > fromMs);
  const trades = [];
  let seq = 0;

  for (const bar of window) {
    const span = bar.high - bar.low;
    const perMinute = Math.max(1, Math.round(TRADES_PER_MINUTE * (0.5 + rng())));
    for (let i = 0; i < perMinute; i++) {
      const last = i === perMinute - 1;
      /* Position inside the candle's range, as a scaled multiplier in [0,1]. */
      const u = Math.max(0, Math.min(1, 0.5 + gauss() * 0.28));
      const price = last ? bar.close : bar.low + mul(span, toScaled(u));

      /* Split the minute's volume unevenly across its fills, then floor at one
         unit of the pair's amount scale so nothing rounds to a zero-size fill. */
      const share = (0.4 + 1.2 * rng()) / perMinute;
      let amount = mul(bar.volume, toScaled(share));
      const minAmount = 10n ** BigInt(SCALE - cfg.amountScale);
      if (amount < minAmount) amount = minAmount;

      const turnover = mul(amount, price);
      const direction = price >= bar.open ? 'BUY' : 'SELL';
      const offset = Math.floor((MS_MINUTE * (i + 1)) / (perMinute + 1));
      const time = bar.time - MS_MINUTE + offset;

      seq += 1;
      const tag = String(bar.time) + '-' + seq;
      trades.push({
        _class: TRADE_CLASS,
        symbol: cfg.symbol,
        price: formatDecimal(price, cfg.priceScale),
        amount: formatDecimal(amount, cfg.amountScale),
        buyTurnover: formatDecimal(turnover, 8),
        sellTurnover: formatDecimal(turnover, 8),
        direction: direction,
        buyOrderId: 'SEED-B' + tag,
        sellOrderId: 'SEED-S' + tag,
        time: Long(String(time)),
      });
    }
  }
  return trades;
}

/* ── write ─────────────────────────────────────────────────────────────────── */

function replaceCollection(name, docs) {
  const col = db.getCollection(name);
  col.deleteMany({});
  for (let i = 0; i < docs.length; i += INSERT_BATCH) {
    col.insertMany(docs.slice(i, i + INSERT_BATCH), { ordered: false });
  }
  return docs.length;
}

function seedSymbol(cfg, nowMs) {
  const rng = makeRng((SEED ^ hashString(cfg.symbol)) >>> 0);
  const gauss = makeGauss(rng);
  const target = parseDecimal(cfg.price);

  const hourEnd = Math.floor(nowMs / MS_HOUR) * MS_HOUR;
  const minuteEnd = Math.floor(nowMs / MS_MINUTE) * MS_MINUTE;
  const minuteStart = hourEnd - MINUTE_DAYS * MS_DAY;

  /* Two chained walks: hourly for the deep history, minute for the recent
     window. Seeding a full year at minute resolution would be half a million
     documents per pair for bars no chart will ever request. */
  const hourCount = (HISTORY_DAYS - MINUTE_DAYS) * 24;
  const hourly = buildCandles(cfg, rng, gauss, target, MS_HOUR, hourCount, minuteStart);

  const minuteCount = Math.round((minuteEnd - minuteStart) / MS_MINUTE);
  const startForMinutes = hourly.length ? hourly[hourly.length - 1].close : target;
  const minutes = buildCandles(cfg, rng, gauss, startForMinutes, MS_MINUTE, minuteCount, minuteEnd);

  /* Normalise both legs by the same factor so the join stays continuous. */
  const finalClose = minutes[minutes.length - 1].close;
  const factor = (target * ONE) / finalClose;
  for (const bar of hourly.concat(minutes)) {
    bar.open = mul(bar.open, factor);
    bar.high = mul(bar.high, factor);
    bar.low = mul(bar.low, factor);
    bar.close = mul(bar.close, factor);
  }

  /* The hourly series the long intervals roll up from is the deep history plus
     the recent minutes folded into whole hours - one continuous series. */
  const hourlyAll = hourly.concat(aggregate(minutes, MS_MINUTE, { name: '1hour', ms: MS_HOUR }));

  const written = {};
  let total = 0;

  for (const period of MINUTE_PERIODS) {
    const bars = period.ms === MS_MINUTE ? minutes : aggregate(minutes, MS_MINUTE, period);
    written[period.name] = replaceCollection(
      'exchange_kline_' + cfg.symbol + '_' + period.name,
      bars.map((b) => klineDoc(cfg, b, period.name)),
    );
    total += written[period.name];
  }

  for (const period of HOUR_PERIODS) {
    const bars = period.ms === MS_HOUR ? hourlyAll : aggregate(hourlyAll, MS_HOUR, period);
    written[period.name] = replaceCollection(
      'exchange_kline_' + cfg.symbol + '_' + period.name,
      bars.map((b) => klineDoc(cfg, b, period.name)),
    );
    total += written[period.name];
  }

  const trades = buildTrades(cfg, minutes, rng, gauss, nowMs);
  written.trades = replaceCollection('exchange_trade_' + cfg.symbol, trades);

  const last = minutes[minutes.length - 1];
  return {
    symbol: cfg.symbol,
    last: formatDecimal(last.close, cfg.priceScale),
    candles: total,
    trades: written.trades,
    detail: written,
  };
}

/* ── main ──────────────────────────────────────────────────────────────────── */

const nowMs = Date.now();
const selected = ONLY.length ? SYMBOLS.filter((s) => ONLY.indexOf(s.symbol) >= 0) : SYMBOLS;
if (selected.length === 0) throw new Error('MARKET_SEED_SYMBOLS matched no configured pair');

print('seeding market history into "' + db.getName() + '"');
print('  seed=' + SEED + '  history=' + HISTORY_DAYS + 'd  minutes=' + MINUTE_DAYS + 'd  now=' + new Date(nowMs).toISOString());

let candles = 0;
let trades = 0;
for (const cfg of selected) {
  const result = seedSymbol(cfg, nowMs);
  candles += result.candles;
  trades += result.trades;
  print('  ' + result.symbol.padEnd(11) + ' last=' + result.last.padStart(12) +
        '  candles=' + String(result.candles).padStart(6) + '  trades=' + String(result.trades).padStart(4));
}
print('done: ' + candles + ' candles, ' + trades + ' trades across ' + selected.length + ' pairs');
print('');
print('NOTE: the market service caches its 24h summary in memory and only');
print('rebuilds it from these candles at startup (ApplicationEvent ->');
print('CoinProcessor.initializeThumb). Restart intafaced-coinex-market for');
print('/market/symbol-thumb to pick this up.');
