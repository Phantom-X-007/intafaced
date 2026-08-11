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
    <div className="flex h-full min-h-[200px] max-h-[240px] flex-col bg-[#040705] font-mono text-[10px] lg:max-h-none lg:min-h-[220px]">
      <div className="flex items-center justify-between border-b border-line px-2 py-2 text-mute">
        <span className="uppercase tracking-wider">Order book</span>
        <span className="text-lime/80">DEMO</span>
      </div>
      <div className="grid grid-cols-3 gap-1 border-b border-line px-2 py-1 text-[9px] uppercase tracking-wider text-mute">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>
      <div className="flex-1 overflow-hidden">
        {[...asks].reverse().map((row, i) => (
          <div key={`a-${i}`} className="relative grid grid-cols-3 gap-1 px-2 py-0.5">
            <div className="absolute inset-y-0 right-0 bg-danger/10" style={{ width: `${(row.s / max) * 100}%` }} aria-hidden />
            <span className="relative text-danger">{row.p.toLocaleString()}</span>
            <span className="relative text-right text-mute">{row.s.toFixed(2)}</span>
            <span className="relative text-right text-mute/70">{(row.s * 1.4).toFixed(2)}</span>
          </div>
        ))}
        <div className="my-1 border-y border-line bg-panel px-2 py-1.5 text-center">
          <span className="text-sm font-bold text-lime">{mark}</span>
          <span className="ml-2 text-[9px] text-mute">{markLabel} · demo</span>
        </div>
        {bids.map((row, i) => (
          <div key={`b-${i}`} className="relative grid grid-cols-3 gap-1 px-2 py-0.5">
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
