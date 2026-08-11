import { useState } from 'react';

const PLANES = {
  fiat: {
    tag: 'We hold it - so we say so',
    title: 'Fiat plane',
    points: [
      'Custodial. Compliant. Trade, bank, cards, institutional flow.',
      'Double-entry ledger on every movement. No exceptions.',
      'Cold / warm / hot custody with multi-sig workflow.',
    ],
  },
  proto: {
    tag: 'You hold it - nothing to ask',
    title: 'Protocol plane',
    points: [
      'Non-custodial by architecture. Zero KYC is not a loophole.',
      'Passkey smart accounts. Session keys you grant and revoke.',
      'We never hold withdrawal rights - enforced by the build.',
    ],
  },
} as const;

/** Split-screen planes - hover a side to activate (no dead toggle cards) */
export function PlanesSplit() {
  const [plane, setPlane] = useState<'fiat' | 'proto'>('fiat');
  const active = PLANES[plane];

  return (
    <section id="planes" className="relative border-y border-line">
      <div className="mx-auto max-w-6xl xl:max-w-7xl px-4 py-14 md:px-6">
        <h2 className="max-w-[14ch] text-3xl font-extrabold tracking-tight md:text-4xl">We refuse the trade-off</h2>
        <p className="mt-2 max-w-[40ch] text-sm text-mute">Hover a plane. Who holds the keys is never fuzzy.</p>
      </div>

      <div className="grid md:grid-cols-2">
        {(
          [
            ['fiat', 'Fiat plane'],
            ['proto', 'Protocol plane'],
          ] as const
        ).map(([id, label]) => {
          const on = plane === id;
          return (
            <button
              key={id}
              type="button"
              onMouseEnter={() => setPlane(id)}
              onFocus={() => setPlane(id)}
              onClick={() => setPlane(id)}
              className={[
                'relative min-h-[280px] border-t border-line px-6 py-10 text-left transition md:border-t-0 md:first:border-r',
                on ? 'bg-panel' : 'bg-void opacity-60 hover:opacity-90',
              ].join(' ')}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute">{label}</span>
              <p className={['mt-6 text-4xl font-extrabold tracking-tight md:text-5xl', on ? 'text-lime' : 'text-ink'].join(' ')}>
                {id === 'fiat' ? 'WE HOLD' : 'YOU HOLD'}
              </p>
              <p className="mt-2 max-w-[20ch] text-sm text-mute">{PLANES[id].tag}</p>
              {on ? (
                <ul className="mt-8 max-w-[36ch] space-y-2 text-sm text-mute">
                  {PLANES[id].points.map((p) => (
                    <li key={p} className="border-l border-lime/40 pl-3">
                      {p}
                    </li>
                  ))}
                </ul>
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="border-t border-line bg-[#070c09] px-4 py-3 text-center font-mono text-[11px] tracking-wide text-lime">
        ZERO-KYC FOLLOWS CUSTODY · PROVABLY NON-CUSTODIAL OR IT DOES NOT MERGE
      </p>
      <span className="sr-only">{active.title}</span>
    </section>
  );
}
