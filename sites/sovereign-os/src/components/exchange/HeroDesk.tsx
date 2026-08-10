import { lazy, Suspense } from 'react';

const TradeChart = lazy(() => import('@/components/trade-chart').then((m) => ({ default: m.TradeChart })));

const PAIRS = [
  { s: 'BTC-PERP', p: '67,412', c: '+2.4%', up: true },
  { s: 'ETH-PERP', p: '3,412', c: '+1.1%', up: true },
  { s: 'SOL-PERP', p: '178.4', c: '−0.6%', up: false },
  { s: 'BTC-USD', p: '67,390', c: '+2.3%', up: true },
] as const;

const BOOK = [
  { side: 'ask' as const, p: '67,418', s: '0.40' },
  { side: 'ask' as const, p: '67,415', s: '1.55' },
  { side: 'ask' as const, p: '67,412', s: '0.90' },
  { side: 'bid' as const, p: '67,410', s: '1.24' },
  { side: 'bid' as const, p: '67,408', s: '0.82' },
  { side: 'bid' as const, p: '67,405', s: '2.10' },
];

/**
 * Compact exchange desk for the hero — charts + pairs + book.
 * Demo numbers only. Restores terminal density without dumping full page chrome.
 */
export function HeroDesk() {
  return (
    <div className="relative w-full max-w-lg xl:max-w-none">
      {/* Soft glow behind desk */}
      <div
        className="pointer-events-none absolute -inset-6 rounded-lg bg-[radial-gradient(ellipse_at_center,rgba(196,240,0,0.12),transparent_65%)] blur-xl"
        aria-hidden
      />

      <div className="relative overflow-hidden rounded-[4px] border border-line/80 bg-[#040705]/90 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-md">
        {/* Title bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 font-mono text-[10px]">
          <span className="h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_8px_#c4f000]" />
          <span className="font-bold tracking-wide text-ink">BTC-PERP</span>
          <span className="text-mute">CROSS 20×</span>
          <span className="text-lime">+2.4%</span>
          <span className="ml-auto rounded-sm border border-line px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-mute">Preview</span>
        </div>

        {/* Pair strip */}
        <div className="flex gap-1 overflow-x-auto border-b border-line px-2 py-1.5 scrollbar-none">
          {PAIRS.map((row) => (
            <div
              key={row.s}
              className={[
                'shrink-0 rounded-sm border px-2 py-1 font-mono text-[9px]',
                row.s === 'BTC-PERP' ? 'border-lime/40 bg-lime/10 text-ink' : 'border-line/60 text-mute',
              ].join(' ')}
            >
              <span className="mr-1.5">{row.s}</span>
              <span className={row.up ? 'text-lime' : 'text-danger'}>{row.c}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_100px] sm:grid-cols-[1fr_112px]">
          <div className="min-w-0 border-r border-line">
            <Suspense fallback={<div className="flex h-[200px] items-center justify-center font-mono text-[10px] text-mute">…</div>}>
              <TradeChart height={200} />
            </Suspense>
            <div className="flex flex-wrap gap-3 border-t border-line px-2 py-1.5 font-mono text-[9px] text-mute">
              <span>
                Mark <span className="text-ink">67,412</span>
              </span>
              <span>
                Fund <span className="text-lime">+0.012%</span>
              </span>
              <span>
                OI <span className="text-ink">$1.2B</span>
              </span>
            </div>
          </div>
          <div className="flex flex-col font-mono text-[9px]">
            <div className="border-b border-line px-1.5 py-1 text-[8px] uppercase tracking-wider text-mute">Book</div>
            {BOOK.map((row, i) => (
              <div key={i} className="relative grid grid-cols-2 gap-1 px-1.5 py-0.5">
                <div
                  className={['absolute inset-y-0 right-0 opacity-30', row.side === 'ask' ? 'bg-danger/40' : 'bg-lime/40'].join(' ')}
                  style={{ width: `${30 + i * 8}%` }}
                  aria-hidden
                />
                <span className={['relative', row.side === 'ask' ? 'text-danger' : 'text-lime'].join(' ')}>{row.p}</span>
                <span className="relative text-right text-mute">{row.s}</span>
              </div>
            ))}
            <div className="mt-auto border-t border-line px-1.5 py-1.5">
              <div className="mb-1 grid grid-cols-2 gap-1">
                <span className="bg-lime/90 py-1 text-center text-[8px] font-bold text-[#081008]">BUY</span>
                <span className="border border-line py-1 text-center text-[8px] text-mute">SELL</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating metric cards — exchange hero chrome */}
      <div className="pointer-events-none absolute -left-3 top-10 hidden flex-col gap-2 sm:flex lg:-left-6">
        <div className="border border-line/70 bg-panel/80 px-2.5 py-1.5 font-mono text-[9px] backdrop-blur-md">
          <span className="block text-mute">24h volume</span>
          <span className="text-ink">$840M</span>
          <span className="ml-1 text-mute">preview</span>
        </div>
      </div>
      <div className="pointer-events-none absolute -right-2 bottom-16 hidden sm:block lg:-right-4">
        <div className="border border-line/70 bg-panel/80 px-2.5 py-1.5 font-mono text-[9px] backdrop-blur-md">
          <span className="block text-mute">Liquidations 24h</span>
          <span className="text-danger">$12.4M</span>
          <span className="ml-1 text-mute">preview</span>
        </div>
      </div>
    </div>
  );
}
