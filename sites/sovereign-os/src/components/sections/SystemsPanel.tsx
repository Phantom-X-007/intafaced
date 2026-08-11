import { useState } from 'react';

const SYSTEMS = [
  {
    id: 'id',
    label: 'Identity',
    title: 'The Identity',
    body: 'Verify once. Trade, bank, launch, learn, sell, predict - everywhere. Rank earned in any room counts in every room.',
    visual: ['LOGIN', 'RANK', 'WALLET SET'],
  },
  {
    id: 'bal',
    label: 'Balance',
    title: 'The Balance',
    body: 'Money is never trapped in a room. Double-entry always. No module holds a balance. Recipes only.',
    visual: ['LEDGER', 'RECIPES', 'NO SILVER BALANCES'],
  },
  {
    id: 'tok',
    label: 'Token',
    title: 'The Token',
    body: 'One asset across rooms and planes. Fee discounts. Rewards. Buybacks. The community holds the upside.',
    visual: ['FEES', 'STAKE', 'BUYBACK'],
  },
] as const;

/** Shared systems - hover rails with a living status strip, not plain tabs alone */
export function SystemsPanel() {
  const [id, setId] = useState(0);
  const s = SYSTEMS[id]!;

  return (
    <section className="mx-auto max-w-6xl xl:max-w-7xl px-4 py-16 md:px-6">
      <h2 className="max-w-[18ch] text-2xl font-extrabold tracking-tight md:text-3xl">
        If a feature needs a fourth system, the design is wrong
      </h2>
      <div className="mt-8 grid gap-6 lg:grid-cols-[200px_1fr]">
        <div className="flex flex-row gap-1 lg:flex-col" role="tablist">
          {SYSTEMS.map((sys, i) => (
            <button
              key={sys.id}
              type="button"
              role="tab"
              aria-selected={id === i}
              onMouseEnter={() => setId(i)}
              onFocus={() => setId(i)}
              onClick={() => setId(i)}
              className={
                id === i
                  ? 'border border-lime/40 bg-lime/10 px-3 py-3 text-left font-mono text-[11px] font-bold uppercase tracking-wider text-lime'
                  : 'border border-line px-3 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-mute hover:text-ink'
              }
            >
              {sys.label}
            </button>
          ))}
        </div>
        <div className="relative min-h-[200px] overflow-hidden border border-line bg-panel p-6">
          <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden>
            <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-lime/10 blur-3xl" />
          </div>
          <h3 className="relative text-xl font-bold text-ink">{s.title}</h3>
          <p className="relative mt-3 max-w-[48ch] text-sm leading-relaxed text-mute">{s.body}</p>
          <div className="relative mt-6 flex flex-wrap gap-2">
            {s.visual.map((chip) => (
              <span key={chip} className="border border-line bg-void px-2.5 py-1 font-mono text-[10px] tracking-wider text-lime">
                {chip}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
