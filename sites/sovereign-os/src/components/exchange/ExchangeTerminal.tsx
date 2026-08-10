import { BorderBeam } from '@/components/magicui/border-beam';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { lazy, Suspense } from 'react';
import { MarketsList } from './MarketsList';
import { OrderBook } from './OrderBook';
import { OrderTicket } from './OrderTicket';

const TradeChart = lazy(() => import('@/components/trade-chart').then((m) => ({ default: m.TradeChart })));

/**
 * Full exchange terminal mock for TV reviewers:
 * markets · chart · order book · ticket. All demo data.
 */
export function ExchangeTerminal() {
  return (
    <section id="trade" className="mx-auto max-w-6xl xl:max-w-7xl px-4 py-14 md:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">Exchange · the terminal</p>
          <h2 className="mt-2 max-w-[18ch] text-3xl font-extrabold tracking-tight md:text-4xl">
            Full terminal
            <br />
            not a toy chart
          </h2>
          <p className="mt-3 max-w-[44ch] text-sm text-mute">
            Markets list, candlesticks, order book, and ticket on one surface. Drawings and multi-layout charting for people who trade —
            execution stays on our rails.
          </p>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-mute">Demo data only · licensed pro charting path in progress</p>
      </div>

      <Tabs defaultValue="perp" className="mb-3">
        <TabsList>
          <TabsTrigger value="spot">Spot</TabsTrigger>
          <TabsTrigger value="perp">Perpetuals</TabsTrigger>
          <TabsTrigger value="opt">Options</TabsTrigger>
          <TabsTrigger value="otc">OTC</TabsTrigger>
        </TabsList>
        <TabsContent value="spot" className="text-sm text-mute">
          Cash markets. Convert. Full depth when live.
        </TabsContent>
        <TabsContent value="perp" className="text-sm text-mute">
          Cross / isolated. Mark price. Funding. Liquidation engine on the book.
        </TabsContent>
        <TabsContent value="opt" className="text-sm text-mute">
          Roadmap surface — same terminal chrome, same identity.
        </TabsContent>
        <TabsContent value="otc" className="text-sm text-mute">
          Block size. RFQ. Settlement on the plane you choose.
        </TabsContent>
      </Tabs>

      <div className="relative overflow-hidden rounded-[3px] border border-line bg-[#040705] shadow-2xl">
        <BorderBeam />
        <div className="relative z-10">
          {/* Top bar */}
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2 font-mono text-[11px]">
            <span className="h-2 w-2 rounded-full bg-lime shadow-[0_0_10px_#c4f000]" />
            <span className="font-bold">BTC-PERP</span>
            <span className="text-mute">CROSS · 20×</span>
            <span className="text-lime">Mark 67,412.2</span>
            <span className="text-lime">+2.4%</span>
            <span className="ml-auto rounded-sm border border-line px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-mute">DEMO</span>
          </div>

          {/* Terminal grid */}
          <div className="grid lg:grid-cols-[160px_1fr_180px]">
            <div className="hidden lg:block">
              <MarketsList />
            </div>
            <div className="min-w-0 border-line lg:border-x">
              <Suspense
                fallback={<div className="flex h-[320px] items-center justify-center font-mono text-[11px] text-mute">Loading chart…</div>}
              >
                <TradeChart height={320} />
              </Suspense>
              <div className="flex flex-wrap gap-4 border-t border-line px-3 py-2 font-mono text-[10px] text-mute">
                <span>
                  OI <span className="text-ink">$1.2B</span>
                </span>
                <span>
                  24h vol <span className="text-ink">$840M</span>
                </span>
                <span>
                  Funding <span className="text-lime">+0.012%</span>
                </span>
                <span className="text-mute/80">Illustrative series</span>
              </div>
            </div>
            <div className="hidden md:block">
              <OrderBook />
            </div>
          </div>

          {/* Ticket + mobile book */}
          <div className="grid border-t border-line md:grid-cols-[1fr_220px]">
            <div className="grid grid-cols-2 gap-0 md:hidden">
              <MarketsList />
              <OrderBook />
            </div>
            <div className="hidden items-center gap-6 px-4 font-mono text-[11px] text-mute md:flex">
              <span>
                Position <span className="text-ink">—</span>
              </span>
              <span>
                Margin <span className="text-ink">—</span>
              </span>
              <span>
                Liq. <span className="text-ink">—</span>
              </span>
              <span className="text-mute/70">Demo terminal — no live account</span>
            </div>
            <OrderTicket />
          </div>
        </div>
      </div>
    </section>
  );
}
