import { loadCandles, type CandleSymbol } from '@/lib/candles';
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';

type Props = {
  height?: number;
  /** Binance-style symbol for real OHLC */
  symbol?: CandleSymbol;
  onQuote?: (q: { last: number; changePct: number; source: 'live' | 'baked' }) => void;
};

/**
 * Real market candles via Binance public klines (free, CORS *).
 * Baked 1h JSON fallback under public/data. Volume histogram under price.
 */
export function TradeChart({ height = 320, symbol = 'BTCUSDT', onQuote }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [status, setStatus] = useState<'loading' | 'live' | 'baked' | 'error'>('loading');
  const [err, setErr] = useState<string | null>(null);

  // Create chart once
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const chartH = height;
    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: '#040705' },
        textColor: '#7f9186',
        fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
      },
      grid: {
        vertLines: { color: '#121a15' },
        horzLines: { color: '#121a15' },
      },
      rightPriceScale: { borderColor: '#1a261f', scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: {
        borderColor: '#1a261f',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: 'rgba(196,240,0,0.28)', labelBackgroundColor: '#1a261f' },
        horzLine: { color: 'rgba(196,240,0,0.28)', labelBackgroundColor: '#1a261f' },
      },
      width: el.clientWidth,
      height: chartH,
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#c4f000',
      downColor: '#ff5c45',
      borderVisible: false,
      wickUpColor: '#c4f000',
      wickDownColor: '#ff5c45',
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    chartRef.current = chart;
    candleRef.current = candles;
    volRef.current = volume;

    const ro = new ResizeObserver(() => {
      if (!hostRef.current) return;
      chart.applyOptions({ width: hostRef.current.clientWidth, height: chartH });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
    };
  }, [height]);

  // Load / reload series when symbol changes
  useEffect(() => {
    const candles = candleRef.current;
    const vol = volRef.current;
    const chart = chartRef.current;
    if (!candles || !vol || !chart) return;

    const ac = new AbortController();
    setStatus('loading');
    setErr(null);

    void (async () => {
      try {
        const { candles: rows, source } = await loadCandles(symbol, ac.signal);
        if (ac.signal.aborted) return;
        if (!rows.length) throw new Error('empty series');

        candles.setData(
          rows.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })),
        );
        vol.setData(
          rows.map((c) => ({
            time: c.time as UTCTimestamp,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(196,240,0,0.35)' : 'rgba(255,92,69,0.35)',
          })),
        );
        chart.timeScale().fitContent();
        setStatus(source);

        const first = rows[0]!;
        const last = rows[rows.length - 1]!;
        const changePct = ((last.close - first.open) / first.open) * 100;
        onQuote?.({ last: last.close, changePct, source });
      } catch (e) {
        if (ac.signal.aborted) return;
        setStatus('error');
        setErr(e instanceof Error ? e.message : 'chart load failed');
      }
    })();

    return () => ac.abort();
  }, [symbol, onQuote]);

  return (
    <div className="relative w-full" style={{ height }}>
      <div ref={hostRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-2 top-2 font-mono text-[9px] uppercase tracking-wider text-mute">
        {status === 'loading' && <span className="text-mute">Loading market…</span>}
        {status === 'live' && <span className="text-lime">Live feed · 1h · {symbol}</span>}
        {status === 'baked' && <span className="text-lime/80">Market snapshot · 1h · {symbol}</span>}
        {status === 'error' && <span className="text-danger">Chart error · {err}</span>}
      </div>
    </div>
  );
}
