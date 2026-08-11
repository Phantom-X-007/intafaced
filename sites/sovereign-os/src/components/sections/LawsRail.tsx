import { useState } from 'react';

const LAWS = [
  {
    n: '01',
    t: 'Trade is one login',
    b: 'Spot, perps, options, OTC, borrow, spend. One identity. One rank. Every room.',
  },
  {
    n: '02',
    t: 'Every fill can pay you',
    b: 'Fee discounts. Mining. Staking. Referrals. Participation gets rewarded.',
  },
  {
    n: '03',
    t: 'Exchange flow feeds the token',
    b: 'Fees, funding, launches. The community holds the upside.',
  },
] as const;

/** Hover-expand law rail - not three equal cards */
export function LawsRail() {
  const [active, setActive] = useState(0);

  return (
    <section className="mx-auto max-w-6xl xl:max-w-7xl px-4 py-16 md:px-6">
      <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">Three laws</h2>
      <p className="mt-2 max-w-[36ch] text-sm text-mute">Hover a number - the law opens. Same rules on every desk.</p>
      <div className="mt-8 flex flex-col gap-2 md:flex-row md:min-h-[220px]">
        {LAWS.map((law, i) => {
          const on = active === i;
          return (
            <button
              key={law.n}
              type="button"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className={[
                'group relative overflow-hidden border text-left transition-all duration-300',
                on
                  ? 'flex-[2.2] border-lime/40 bg-gradient-to-br from-lime/10 to-panel p-5'
                  : 'flex-1 border-line bg-panel p-4 opacity-70 hover:opacity-100',
              ].join(' ')}
            >
              <span className="font-mono text-xs text-lime">{law.n}</span>
              <h3 className={['mt-2 font-bold tracking-tight', on ? 'text-xl md:text-2xl' : 'text-base'].join(' ')}>{law.t}</h3>
              <p
                className={[
                  'mt-2 text-sm text-mute transition-opacity duration-300',
                  on ? 'opacity-100' : 'max-h-0 opacity-0 md:max-h-none md:opacity-40',
                ].join(' ')}
              >
                {law.b}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
