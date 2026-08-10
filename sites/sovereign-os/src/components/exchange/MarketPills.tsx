/** Horizontal market product pills — exchange hero density */

const PILLS = [
  { t: 'Spot', d: 'Cash markets' },
  { t: 'Perpetuals', d: 'Cross & isolated' },
  { t: 'Options', d: 'Path live later' },
  { t: 'OTC', d: 'Block size RFQ' },
  { t: 'Convert', d: 'Instant swap' },
  { t: 'Copy', d: 'Follow flow' },
] as const;

export function MarketPills() {
  return (
    <ul className="mt-8 flex flex-wrap gap-2">
      {PILLS.map((p) => (
        <li key={p.t} className="border border-line/80 bg-panel/50 px-3 py-2 backdrop-blur-sm transition hover:border-lime-dim">
          <span className="block font-mono text-[11px] font-bold tracking-wide text-ink">{p.t}</span>
          <span className="block font-mono text-[9px] text-mute">{p.d}</span>
        </li>
      ))}
    </ul>
  );
}
