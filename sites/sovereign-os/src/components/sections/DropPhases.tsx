import { Meteors } from '@/components/ui/meteors';
import { useState } from 'react';

const PHASES = [
  { id: '0', name: 'Tease', d: 'Signal only. No forms.' },
  { id: 'I', name: 'Blueprint', d: 'Identity card. First flex.' },
  { id: 'II', name: 'Lobby', d: 'Rooms open to early rank.' },
  { id: 'III', name: 'Soft launch', d: 'Desk live for waves.' },
  { id: 'IV', name: 'Public', d: 'House open.' },
  { id: 'V', name: 'Seasons', d: 'Ongoing drops.' },
] as const;

/** Continuous phase track - not a stack of bordered list rows */
export function DropPhases() {
  const [i, setI] = useState(0);
  const p = PHASES[i]!;
  const pct = (i / (PHASES.length - 1)) * 100;

  return (
    <section id="drop" className="relative overflow-hidden border-y border-line bg-void py-14 md:py-16">
      <Meteors number={10} />
      <div className="relative z-[1] mx-auto max-w-6xl xl:max-w-7xl px-4 md:px-6">
        <div className="grid gap-8 md:grid-cols-[1fr_1.2fr] md:items-end">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">Not a fintech announcement. A game release.</h2>
            <p className="mt-3 text-sm text-mute">Walk the path. Hover a stage.</p>
          </div>
          <div className="border border-line bg-panel px-5 py-4">
            <p className="font-mono text-[11px] tracking-[0.14em] text-lime">
              PHASE {p.id} · {p.name.toUpperCase()}
            </p>
            <p className="mt-2 text-lg font-semibold text-ink">{p.d}</p>
          </div>
        </div>

        {/* Track */}
        <div className="relative mt-10 border border-line bg-panel/50 px-3 py-6 md:px-6">
          <div className="absolute left-0 right-0 top-3 h-px bg-line" aria-hidden />
          <div className="absolute left-0 top-3 h-px bg-lime transition-all duration-300" style={{ width: `${pct}%` }} aria-hidden />
          <div className="relative flex justify-between gap-1">
            {PHASES.map((ph, idx) => {
              const on = i === idx;
              const done = idx <= i;
              return (
                <button
                  key={ph.id}
                  type="button"
                  onMouseEnter={() => setI(idx)}
                  onFocus={() => setI(idx)}
                  onClick={() => setI(idx)}
                  className="flex flex-1 flex-col items-center gap-2 pt-0 text-center"
                >
                  <span
                    className={[
                      'h-2.5 w-2.5 rounded-full border transition',
                      on ? 'border-lime bg-lime shadow-[0_0_12px_#c4f000]' : done ? 'border-lime/60 bg-lime/40' : 'border-line bg-void',
                    ].join(' ')}
                  />
                  <span className={['font-mono text-[10px] tracking-wider', on ? 'text-lime' : 'text-mute'].join(' ')}>{ph.id}</span>
                  <span className={['hidden text-[11px] sm:block', on ? 'font-semibold text-ink' : 'text-mute'].join(' ')}>{ph.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
