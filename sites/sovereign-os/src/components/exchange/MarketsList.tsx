import type { PairRow } from '@/lib/marketModes';

export function MarketsList({ pairs, active }: { pairs: PairRow[]; active: string }) {
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
        {pairs.map((row) => {
          const on = row.s === active || row.s.startsWith(active.split('-')[0] ?? '');
          return (
            <li
              key={row.s}
              className={[
                'grid grid-cols-[1fr_auto_auto] gap-2 px-2 py-1.5 transition-colors',
                on ? 'bg-lime/10 text-ink' : 'text-mute',
              ].join(' ')}
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
