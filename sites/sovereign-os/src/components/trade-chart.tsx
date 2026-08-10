import { createChart, AreaSeries, ColorType } from 'lightweight-charts';
import { useEffect, useRef } from 'react';

export function TradeChart() {
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
      height: 300,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: '#c4f000',
      topColor: 'rgba(196,240,0,0.28)',
      bottomColor: 'rgba(196,240,0,0.01)',
      lineWidth: 2,
    });

    const data: { time: string; value: number }[] = [];
    let price = 64000;
    const start = new Date(Date.UTC(2025, 0, 1));
    for (let i = 0; i < 90; i++) {
      price = price + Math.sin(i / 5) * 220 + (Math.random() - 0.48) * 280;
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      data.push({
        time: d.toISOString().slice(0, 10),
        value: price,
      });
    }
    series.setData(data);
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, []);

  return <div ref={ref} className="h-[300px] w-full" />;
}
