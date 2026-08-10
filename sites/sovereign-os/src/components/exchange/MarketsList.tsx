/** Demo markets list — exchange pair density. */

const PAIRS = [
  { s: 'BTC-PERP', p: '67,412.2', c: '+2.4%', up: true },
  { s: 'ETH-PERP', p: '3,412.8', c: '+1.1%', up: true },
  { s: 'SOL-PERP', p: '178.44', c: '−0.6%', up: false },
  { s: 'BTC-USD', p: '67,390.0', c: '+2.3%', up: true },
  { s: 'ETH-USD', p: '3,408.1', c: '+0.9%', up: true },
  { s: 'ARB-PERP', p: '0.842', c: '−1.8%', up: false },
  { s: 'DOGE-PERP', p: '0.1482', c: '+4.2%', up: true },
  { s: 'EUR-USD', p: '1.0841', c: '+0.1%', up: true },
] as const;

export function MarketsList({ active = 'BTC-PERP' }: { active?: string }) {
  return (
    <div className="flex h-full min-h-[280px] flex-col border-r border-line bg-[#040705] font-mono text-[10px]">
      <div className="flex items-center justify-between border-b border-line px-2 py-2 text-mute">
        <span className="uppercase tracking-wider">Markets</span>
        <span className="text-lime/80">DEMO</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-line px-2 py-1 text-[9px] uppercase tracking-wider text-mute">
        <span>Pair</span>
        <span className="text-right">Last</span>
        <span className="text-right">24h</span>
      </div>
      <ul className="flex-1 overflow-hidden">
        {PAIRS.map((row) => {
          const on = row.s === active;
          return (
            <li
              key={row.s}
              className={['grid grid-cols-[1fr_auto_auto] gap-2 px-2 py-1.5', on ? 'bg-lime/10 text-ink' : 'text-mute hover:bg-panel'].join(
                ' ',
              )}
            >
              <span className={on ? 'font-bold text-lime' : ''}>{row.s}</span>
              <span className="text-right tabular-nums text-ink">{row.p}</span>
              <span className={['text-right tabular-nums', row.up ? 'text-lime' : 'text-danger'].join(' ')}>{row.c}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
