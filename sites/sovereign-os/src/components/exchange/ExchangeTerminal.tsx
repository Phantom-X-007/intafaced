import { BorderBeam } from '@/components/magicui/border-beam';
import { formatPrice } from '@/lib/candles';
import { MODES, type MarketMode, modeById } from '@/lib/marketModes';
import { lazy, Suspense, useCallback, useState } from 'react';
import { MarketsList } from './MarketsList';
import { OrderBook } from './OrderBook';
import { OrderTicket } from './OrderTicket';

const TradeChart = lazy(() => import('@/components/trade-chart').then((m) => ({ default: m.TradeChart })));

const CHAIN = [
  { strike: '66,000', call: '3,120', put: '410', iv: '44%' },
  { strike: '67,000', call: '2,110', put: '720', iv: '48%' },
  { strike: '68,000', call: '1,240', put: '1,180', iv: '49%' },
  { strike: '69,000', call: '680', put: '1,920', iv: '51%' },
  { strike: '70,000', call: '340', put: '2,860', iv: '53%' },
];

/**
 * Full terminal. Hover market modes to swap chart / book / ticket.
 * Layout: pairs | chart | book+ticket (no empty footer row under the desk).
 * Scroll is stable — no glow-on-scroll, no sub-pixel chart reflow zoom.
 */
export function ExchangeTerminal() {
  const [mode, setMode] = useState<MarketMode>('perp');
  const cfg = modeById(mode);
  const [quote, setQuote] = useState<{ last: number; changePct: number; source: 'live' | 'baked' } | null>(null);

  const setModeSafe = (id: MarketMode) => {
    setMode(id);
    setQuote(null);
  };

  const onQuote = useCallback((q: { last: number; changePct: number; source: 'live' | 'baked' }) => {
    setQuote(q);
  }, []);

  const markStr = quote ? formatPrice(quote.last) : cfg.mark;
  const chgStr = quote ? `${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(2)}%` : cfg.change;
  const up = quote ? quote.changePct >= 0 : cfg.up;

  const sidePanel =
    cfg.panel === 'book' ? (
      <OrderBook asks={cfg.asks} bids={cfg.bids} mark={markStr} />
    ) : cfg.panel === 'chain' ? (
      <OptionsChain />
    ) : (
      <RfqPanel mark={markStr} />
    );

  return (
    <section id="trade" className="mx-auto max-w-6xl xl:max-w-7xl px-4 py-14 md:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="max-w-[16ch] text-3xl font-extrabold tracking-tight md:text-4xl">
            Full terminal
            <br />
            real market candles
          </h2>
          <p className="mt-3 max-w-[46ch] text-sm text-mute">
            Hover a market type - the desk shifts. Candles pull free public market data (1h). Book and ticket stay demo chrome.
          </p>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-mute">
          {quote?.source === 'live' ? 'Live OHLC' : 'Snapshot OHLC'} · demo ticket
        </p>
      </div>

      <div className="mb-3 flex flex-wrap gap-1 border border-line bg-panel p-1" role="tablist" aria-label="Market type">
        {MODES.map((m) => {
          const on = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={on}
              onMouseEnter={() => setModeSafe(m.id)}
              onFocus={() => setModeSafe(m.id)}
              onClick={() => setModeSafe(m.id)}
              className={
                on
                  ? 'bg-lime px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-[#081008] transition'
                  : 'px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-mute transition hover:text-ink'
              }
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <p className="mb-4 min-h-[1.25rem] font-mono text-[11px] text-mute">{cfg.blurb}</p>

      <div className="relative overflow-hidden rounded-[3px] border border-line bg-[#040705] shadow-2xl">
        {/* Static lime edge only — no scroll-reactive glow (that read as zoom) */}
        <BorderBeam duration={12} />
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2 font-mono text-[11px]">
            <span className="h-2 w-2 rounded-full bg-lime shadow-[0_0_10px_#c4f000]" />
            <span className="font-bold">{cfg.symbol}</span>
            <span className="text-mute">{cfg.meta}</span>
            <span className={up ? 'text-lime' : 'text-danger'}>
              {markStr} {chgStr}
            </span>
            <span className="hidden text-mute sm:inline">· {cfg.label}</span>
            <span className="ml-auto rounded-sm border border-line px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-mute">
              {quote?.source === 'live' ? 'LIVE OHLC' : 'OHLC'}
            </span>
          </div>

          {/*
            Pro desk: pairs | chart | book+ticket stacked.
            Ticket (buy / limit / market) lives in the right rail — no dead footer band.
          */}
          <div className="grid lg:grid-cols-[148px_minmax(0,1fr)_228px]">
            <div className="hidden lg:block">
              <MarketsList pairs={cfg.pairs} active={cfg.symbol} />
            </div>

            <div className="min-w-0 border-line bg-[#070c09] lg:border-x">
              <Suspense
                fallback={
                  <div className="flex h-[340px] flex-col items-center justify-center gap-2 bg-[#070c09] font-mono text-[11px] text-mute">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime" />
                    Loading {cfg.chartSymbol}…
                  </div>
                }
              >
                <TradeChart key={cfg.chartSymbol} height={340} symbol={cfg.chartSymbol} onQuote={onQuote} />
              </Suspense>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-panel/80 px-3 py-2 font-mono text-[10px] text-mute">
                <span className="text-lime">{cfg.chartSymbol}</span>
                {cfg.footer.map((f) => (
                  <span key={f.k}>
                    {f.k} <span className="text-ink">{f.v}</span>
                  </span>
                ))}
                <span className="ml-auto text-mute/70">Candles = market · ticket demo</span>
              </div>
            </div>

            {/* Right rail: depth / chain / RFQ + order ticket (buy · limit · market) */}
            <div className="hidden min-h-0 flex-col md:flex">
              <div className="min-h-0 flex-1 overflow-hidden border-b border-line">{sidePanel}</div>
              <OrderTicket
                buyLabel={cfg.ticket.buy}
                sellLabel={cfg.ticket.sell}
                sizeLabel={cfg.ticket.sizeLabel}
                size={cfg.ticket.size}
                price={markStr}
                note={cfg.ticket.note}
                compact
              />
            </div>
          </div>

          {/* Mobile / tablet: pairs + depth, then full ticket (no empty mode strip) */}
          <div className="border-t border-line md:hidden">
            <div className="grid grid-cols-2">
              <MarketsList pairs={cfg.pairs} active={cfg.symbol} />
              {sidePanel}
            </div>
            <OrderTicket
              buyLabel={cfg.ticket.buy}
              sellLabel={cfg.ticket.sell}
              sizeLabel={cfg.ticket.sizeLabel}
              size={cfg.ticket.size}
              price={markStr}
              note={cfg.ticket.note}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function OptionsChain() {
  return (
    <div className="flex h-full min-h-[200px] max-h-[220px] flex-col bg-[#040705] font-mono text-[10px]">
      <div className="border-b border-line px-2 py-2 text-mute">
        <span className="uppercase tracking-wider">Options chain</span>
        <span className="ml-2 text-lime/80">DEMO</span>
      </div>
      <div className="grid grid-cols-4 gap-1 border-b border-line px-2 py-1 text-[8px] uppercase text-mute">
        <span>Strike</span>
        <span className="text-right">Call</span>
        <span className="text-right">Put</span>
        <span className="text-right">IV</span>
      </div>
      {CHAIN.map((row) => (
        <div key={row.strike} className="grid grid-cols-4 gap-1 px-2 py-1.5 hover:bg-panel">
          <span className="text-ink">{row.strike}</span>
          <span className="text-right text-lime">{row.call}</span>
          <span className="text-right text-danger">{row.put}</span>
          <span className="text-right text-mute">{row.iv}</span>
        </div>
      ))}
    </div>
  );
}

function RfqPanel({ mark }: { mark: string }) {
  return (
    <div className="flex h-full min-h-[200px] max-h-[220px] flex-col justify-between bg-[#040705] p-3 font-mono text-[10px]">
      <div>
        <p className="uppercase tracking-wider text-mute">OTC desk</p>
        <p className="mt-3 text-2xl font-bold text-ink">{mark}</p>
        <p className="mt-1 text-mute">Indicative mid · demo</p>
        <ul className="mt-4 space-y-2 text-mute">
          <li className="flex justify-between border-b border-line pb-1">
            <span>Min</span>
            <span className="text-ink">10 BTC</span>
          </li>
          <li className="flex justify-between border-b border-line pb-1">
            <span>Settle</span>
            <span className="text-ink">T+0 / plane</span>
          </li>
        </ul>
      </div>
      <p className="text-[9px] text-mute">RFQ replaces book on OTC hover.</p>
    </div>
  );
}
