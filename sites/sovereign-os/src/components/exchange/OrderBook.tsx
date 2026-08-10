/** Demo order book — visual exchange density only. No live prices. */

const BIDS = [
  [67410.2, 1.24],
  [67408.5, 0.82],
  [67405.1, 2.1],
  [67401.0, 0.45],
  [67398.4, 3.02],
  [67395.0, 1.1],
  [67390.2, 0.66],
  [67385.5, 4.2],
] as const;

const ASKS = [
  [67412.8, 0.9],
  [67415.0, 1.55],
  [67418.4, 0.4],
  [67422.1, 2.3],
  [67428.0, 0.75],
  [67435.5, 1.8],
  [67442.0, 0.33],
  [67450.2, 2.05],
] as const;

export function OrderBook() {
  const max = 4.2;
  return (
    <div className="flex h-full min-h-[280px] flex-col border-l border-line bg-[#040705] font-mono text-[10px]">
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
        {[...ASKS].reverse().map(([p, s], i) => (
          <div key={`a-${i}`} className="relative grid grid-cols-3 gap-1 px-2 py-0.5">
            <div className="absolute inset-y-0 right-0 bg-danger/10" style={{ width: `${(s / max) * 100}%` }} aria-hidden />
            <span className="relative text-danger">{p.toLocaleString()}</span>
            <span className="relative text-right text-mute">{s.toFixed(2)}</span>
            <span className="relative text-right text-mute/70">{(s * 1.4).toFixed(2)}</span>
          </div>
        ))}
        <div className="my-1 border-y border-line bg-panel px-2 py-1.5 text-center">
          <span className="text-sm font-bold text-lime">67,412.2</span>
          <span className="ml-2 text-[9px] text-mute">Mark · demo</span>
        </div>
        {BIDS.map(([p, s], i) => (
          <div key={`b-${i}`} className="relative grid grid-cols-3 gap-1 px-2 py-0.5">
            <div className="absolute inset-y-0 right-0 bg-lime/10" style={{ width: `${(s / max) * 100}%` }} aria-hidden />
            <span className="relative text-lime">{p.toLocaleString()}</span>
            <span className="relative text-right text-mute">{s.toFixed(2)}</span>
            <span className="relative text-right text-mute/70">{(s * 1.4).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
