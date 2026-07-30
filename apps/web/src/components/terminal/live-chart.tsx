'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Panel } from '@intafaced/ui';
import { fetchOhlcv, type OhlcvRow } from '@/lib/api/rest';
import { useEdge } from '@/lib/providers';
import { describeFailure, type Failure } from '@/lib/result';
import { FailureNotice, LoadingNotice } from './socket-panel';
import styles from './terminal.module.css';

/**
 * OHLCV CHART — real candles from svc-trade via edge `/api/v1/ohlcv`.
 *
 * Candles are aggregated from the taker fill tape (#201). Empty series means
 * the market has never traded — rendered as an honest empty state, never as
 * fabricated zeros. Money fields stay decimal strings end to end.
 */

const copy = {
  title: 'Chart',
  loading: 'Loading candles…',
  empty: 'No candles yet — this market has not traded',
  noMarket: 'Select a market to load its chart',
  timeframe: '1m',
} as const;

type ChartState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'live'; readonly rows: readonly OhlcvRow[] }
  | { readonly status: 'failed'; readonly failure: Failure };

function parseDec(s: string): number | null {
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function CandleSvg({ rows }: { rows: readonly OhlcvRow[] }) {
  const geometry = useMemo(() => {
    const parsed = rows
      .map((row) => {
        const open = parseDec(row[1]);
        const high = parseDec(row[2]);
        const low = parseDec(row[3]);
        const close = parseDec(row[4]);
        if (open === null || high === null || low === null || close === null) return null;
        return { open, high, low, close };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (parsed.length === 0) return null;

    const hi = Math.max(...parsed.map((c) => c.high));
    const lo = Math.min(...parsed.map((c) => c.low));
    const span = hi - lo || 1;
    const w = 640;
    const h = 180;
    const pad = 8;
    const slot = (w - pad * 2) / parsed.length;

    const y = (price: number) => pad + ((hi - price) / span) * (h - pad * 2);

    return {
      w,
      h,
      candles: parsed.map((c, i) => {
        const x = pad + i * slot + slot / 2;
        const bodyTop = y(Math.max(c.open, c.close));
        const bodyBot = y(Math.min(c.open, c.close));
        const up = c.close >= c.open;
        return {
          x,
          wickTop: y(c.high),
          wickBot: y(c.low),
          bodyTop,
          bodyH: Math.max(1, bodyBot - bodyTop),
          up,
          bodyW: Math.max(2, slot * 0.55),
        };
      }),
    };
  }, [rows]);

  if (!geometry) return <p className={styles.socketReason}>{copy.empty}</p>;

  return (
    <svg className={styles.chartSvg} viewBox={`0 0 ${geometry.w} ${geometry.h}`} role="img" aria-label="OHLCV candles">
      {geometry.candles.map((c, i) => (
        <g key={i} data-dir={c.up ? 'up' : 'down'}>
          <line x1={c.x} x2={c.x} y1={c.wickTop} y2={c.wickBot} className={styles.chartWick} />
          <rect
            x={c.x - c.bodyW / 2}
            y={c.bodyTop}
            width={c.bodyW}
            height={c.bodyH}
            className={c.up ? styles.chartBodyUp : styles.chartBodyDown}
          />
        </g>
      ))}
    </svg>
  );
}

export function LiveChart({ symbol }: { symbol: string | null }) {
  const edge = useEdge();
  const [state, setState] = useState<ChartState>({ status: 'idle' });

  const load = useCallback(async () => {
    if (!symbol) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    const result = await fetchOhlcv(edge, symbol, { timeframe: copy.timeframe, limit: 120 });
    if (!result.ok) {
      setState({ status: 'failed', failure: result });
      return;
    }
    if (result.value.length === 0) {
      setState({ status: 'empty' });
      return;
    }
    setState({ status: 'live', rows: result.value });
  }, [edge, symbol]);

  useEffect(() => {
    void load();
    if (!symbol) return;
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [load, symbol]);

  return (
    <Panel title={`${copy.title} · ${copy.timeframe}`} live={state.status === 'live'}>
      {!symbol && <p className={styles.socketReason}>{copy.noMarket}</p>}
      {symbol && state.status === 'loading' && <LoadingNotice label={copy.loading} />}
      {symbol && state.status === 'empty' && <p className={styles.socketReason}>{copy.empty}</p>}
      {symbol && state.status === 'failed' && <FailureNotice failure={state.failure} />}
      {symbol && state.status === 'live' && (
        <>
          <CandleSvg rows={state.rows} />
          <p className={styles.chartMeta}>
            {state.rows.length} candles · last close <span className="if-numeric">{state.rows[state.rows.length - 1]![4]}</span>
          </p>
        </>
      )}
      {symbol && state.status === 'failed' && <span className={styles.srOnly}>{describeFailure(state.failure)}</span>}
    </Panel>
  );
}
