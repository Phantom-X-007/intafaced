import { useState } from 'react';

const SYSTEMS = [
  {
    id: 'id',
    label: 'Identity',
    title: 'The Identity',
    body: 'Verify once. Trade, bank, launch, learn, sell, predict - everywhere. Rank earned in any room counts in every room.',
    line: 'login → rank → every room',
  },
  {
    id: 'bal',
    label: 'Balance',
    title: 'The Balance',
    body: 'Money is never trapped in a room. Double-entry always. No module holds a balance. Recipes only.',
    line: 'ledger only · recipes only',
  },
  {
    id: 'tok',
    label: 'Token',
    title: 'The Token',
    body: 'One asset across rooms and planes. Fee discounts. Rewards. Buybacks. The community holds the upside.',
    line: 'fees → stake → buyback',
  },
] as const;

/** Underline index + open prose - no chip soup, no heavy bordered sidebar */
export function SystemsPanel() {
  const [id, setId] = useState(0);
  const s = SYSTEMS[id]!;

  return (
    <section className="mx-auto max-w-6xl xl:max-w-7xl px-4 py-20 md:px-6">
      <h2 className="max-w-[18ch] text-2xl font-extrabold tracking-tight md:text-3xl">
        If a feature needs a fourth system, the design is wrong
      </h2>

      <div className="mt-10 flex flex-wrap gap-6 border-b border-line" role="tablist">
        {SYSTEMS.map((sys, i) => (
          <button
            key={sys.id}
            type="button"
            role="tab"
            aria-selected={id === i}
            onMouseEnter={() => setId(i)}
            onFocus={() => setId(i)}
            onClick={() => setId(i)}
            className={[
              '-mb-px border-b-2 pb-3 font-mono text-[11px] uppercase tracking-[0.12em] transition',
              id === i ? 'border-lime text-lime' : 'border-transparent text-mute hover:text-ink',
            ].join(' ')}
          >
            {sys.label}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <h3 className="text-2xl font-bold tracking-tight text-ink">{s.title}</h3>
          <p className="mt-3 max-w-[48ch] text-[15px] leading-relaxed text-mute">{s.body}</p>
        </div>
        <p className="font-mono text-[11px] tracking-[0.08em] text-lime">{s.line}</p>
      </div>
    </section>
  );
}
