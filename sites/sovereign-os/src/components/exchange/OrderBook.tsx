import type { BookRow } from '@/lib/marketModes';

export function OrderBook({
  asks,
  bids,
  mark,
  markLabel = 'Mark',
}: {
  asks: BookRow[];
  bids: BookRow[];
  mark: string;
  markLabel?: string;
}) {
  const max = Math.max(...asks.map((a) => a.s), ...bids.map((b) => b.s), 0.01);
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#040705] font-mono text-[10px]">
      <div className="flex shrink-0 items-center justify-between border-b border-line px-2 py-1.5 text-mute">
        <span className="uppercase tracking-wider">Order book</span>
        <span className="text-lime/80">DEMO</span>
      </div>
      <div className="grid shrink-0 grid-cols-3 gap-1 border-b border-line px-2 py-1 text-[9px] uppercase tracking-wider text-mute">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>
      {/* Scroll if tight - never clip the last bid row */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1">
        {[...asks].reverse().map((row, i) => (
          <div key={`a-${i}`} className="relative grid grid-cols-3 gap-1 px-2 py-0.5 leading-tight">
            <div className="absolute inset-y-0 right-0 bg-danger/10" style={{ width: `${(row.s / max) * 100}%` }} aria-hidden />
            <span className="relative text-danger">{row.p.toLocaleString()}</span>
            <span className="relative text-right text-mute">{row.s.toFixed(2)}</span>
            <span className="relative text-right text-mute/70">{(row.s * 1.4).toFixed(2)}</span>
          </div>
        ))}
        <div className="my-0.5 border-y border-line bg-panel px-2 py-1 text-center">
          <span className="text-sm font-bold text-lime">{mark}</span>
          <span className="ml-2 text-[9px] text-mute">{markLabel} · demo</span>
        </div>
        {bids.map((row, i) => (
          <div key={`b-${i}`} className="relative grid grid-cols-3 gap-1 px-2 py-0.5 leading-tight">
            <div className="absolute inset-y-0 right-0 bg-lime/10" style={{ width: `${(row.s / max) * 100}%` }} aria-hidden />
            <span className="relative text-lime">{row.p.toLocaleString()}</span>
            <span className="relative text-right text-mute">{row.s.toFixed(2)}</span>
            <span className="relative text-right text-mute/70">{(row.s * 1.4).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
