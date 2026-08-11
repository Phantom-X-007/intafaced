import { CandlestickSeries, ColorType, createChart } from 'lightweight-charts';
import { useEffect, useRef } from 'react';

type Props = {
  height?: number;
  /** Base price seed - changes series when market mode switches */
  seed?: number;
};

/** Demo candlestick chart. Illustrative only. */
export function TradeChart({ height = 300, seed = 64000 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

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
      rightPriceScale: { borderColor: '#1a261f' },
      timeScale: { borderColor: '#1a261f' },
      crosshair: {
        vertLine: { color: 'rgba(196,240,0,0.25)' },
        horzLine: { color: 'rgba(196,240,0,0.25)' },
      },
      width: el.clientWidth,
      height,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#c4f000',
      downColor: '#ff5c45',
      borderUpColor: '#c4f000',
      borderDownColor: '#ff5c45',
      wickUpColor: '#c4f000',
      wickDownColor: '#ff5c45',
    });

    // Deterministic from seed so mode switches feel intentional, not random noise
    let close = seed;
    const amp = Math.max(seed * 0.004, 8);
    const data: { time: string; open: number; high: number; low: number; close: number }[] = [];
    const start = new Date(Date.UTC(2025, 0, 1));
    for (let i = 0; i < 90; i++) {
      const open = close;
      const wave = Math.sin((i + (seed % 17)) / 5) * amp + Math.sin(i / 11) * amp * 0.4;
      close = Math.max(0.01, open + wave);
      const high = Math.max(open, close) + amp * 0.35;
      const low = Math.min(open, close) - amp * 0.35;
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      data.push({
        time: d.toISOString().slice(0, 10),
        open,
        high,
        low,
        close,
      });
    }
    series.setData(data);
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [height, seed]);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
