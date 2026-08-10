import { CandlestickSeries, ColorType, createChart } from 'lightweight-charts';
import { useEffect, useRef } from 'react';

type Props = {
  height?: number;
};

/** Demo candlestick chart — illustrative series only. */
export function TradeChart({ height = 300 }: Props) {
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

    const data: { time: string; open: number; high: number; low: number; close: number }[] = [];
    let close = 64000;
    const start = new Date(Date.UTC(2025, 0, 1));
    for (let i = 0; i < 90; i++) {
      const open = close;
      const drift = Math.sin(i / 5) * 180 + (Math.random() - 0.48) * 320;
      close = open + drift;
      const high = Math.max(open, close) + Math.random() * 120;
      const low = Math.min(open, close) - Math.random() * 120;
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
  }, [height]);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
