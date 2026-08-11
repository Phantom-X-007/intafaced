import { useState } from 'react';

const PHASES = [
  { id: '0', name: 'Tease', d: 'Signal only. No forms.' },
  { id: 'I', name: 'Blueprint', d: 'Identity card. First flex.' },
  { id: 'II', name: 'Lobby', d: 'Rooms open to early rank.' },
  { id: 'III', name: 'Soft launch', d: 'Desk live for waves.' },
  { id: 'IV', name: 'Public', d: 'House open.' },
  { id: 'V', name: 'Seasons', d: 'Ongoing drops.' },
] as const;

/** Interactive phase rail - hover lights a stage */
export function DropPhases() {
  const [i, setI] = useState(0);
  const p = PHASES[i]!;

  return (
    <section className="border-y border-line bg-panel/40 py-16">
      <div className="mx-auto max-w-6xl xl:max-w-7xl px-4 md:px-6">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">Not a fintech announcement. A game release.</h2>
            <p className="mt-3 max-w-[36ch] text-sm text-mute">Hover the phases. The drop has a path - not a press PDF.</p>
            <div className="mt-8">
              <p className="font-mono text-lime">
                Phase {p.id} · {p.name}
              </p>
              <p className="mt-2 text-lg text-ink">{p.d}</p>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-2">
            {PHASES.map((ph, idx) => (
              <button
                key={ph.id}
                type="button"
                onMouseEnter={() => setI(idx)}
                onFocus={() => setI(idx)}
                onClick={() => setI(idx)}
                className={[
                  'flex items-center gap-4 border px-3 py-2.5 text-left font-mono text-[11px] transition',
                  i === idx ? 'border-lime/50 bg-lime/10 text-ink' : 'border-line text-mute hover:text-ink',
                ].join(' ')}
              >
                <span className={i === idx ? 'text-lime' : ''}>{ph.id}</span>
                <span className="flex-1 uppercase tracking-wider">{ph.name}</span>
                {i === idx ? <span className="h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_8px_#c4f000]" /> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
