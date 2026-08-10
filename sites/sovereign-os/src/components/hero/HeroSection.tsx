import { SplitHeading } from '@/components/bits/split-heading';
import { NumberTicker } from '@/components/magicui/number-ticker';
import { lazy, Suspense, useEffect, useState } from 'react';
import { HeroFallback } from './HeroFallback';
import { detectWebGL } from './webglDetect';

const HeroWaveCanvas = lazy(() => import('./HeroWaveCanvas').then((m) => ({ default: m.HeroWaveCanvas })));

function useReducedMotion() {
  const [reduce, setReduce] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduce(mq.matches);
    const fn = () => setReduce(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return reduce;
}

const SIDE_CHIPS = ['TRADE', 'PROTOCOL', 'P2P', 'LAUNCH', 'BANK', 'PAY', 'PREDICT', 'ACADEMY', 'TOKEN', 'MINE', 'MARKET', 'AGENTS'];

/**
 * Full-bleed premium hero: wave grid to edges, ambient side rails, soft scrims only.
 */
export function HeroSection() {
  const reduce = useReducedMotion();
  const [want3d, setWant3d] = useState(false);

  useEffect(() => {
    setWant3d(!reduce && detectWebGL());
  }, [reduce]);

  return (
    <section className="relative min-h-[100dvh] w-full overflow-hidden border-b border-line">
      {/* Full-bleed 3D / fallback */}
      <div className="absolute inset-0 z-0">
        {want3d ? (
          <Suspense fallback={<HeroFallback />}>
            <HeroWaveCanvas active className="absolute inset-0" />
            {/* Fallback sits under until canvas fades in */}
            <div className="absolute inset-0 -z-10">
              <HeroFallback />
            </div>
          </Suspense>
        ) : (
          <HeroFallback />
        )}
      </div>

      {/* Soft full-field scrim — not a black pillar on the sides */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-void/70 via-void/25 to-void/80" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_80%_70%_at_30%_45%,rgba(5,8,6,0.55),transparent_65%)]"
        aria-hidden
      />

      {/* Side ambient rails — fill wide screens */}
      <aside
        className="pointer-events-none absolute bottom-[12%] left-3 top-[18%] z-[2] hidden w-14 flex-col justify-between xl:flex 2xl:left-6 2xl:w-16"
        aria-hidden
      >
        <div className="flex flex-1 flex-col justify-center gap-2 overflow-hidden">
          {SIDE_CHIPS.slice(0, 6).map((c) => (
            <span
              key={c}
              className="font-mono text-[9px] tracking-[0.18em] text-lime/35"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              {c}
            </span>
          ))}
        </div>
        <div className="h-24 w-px bg-gradient-to-b from-transparent via-lime/40 to-transparent" />
      </aside>
      <aside
        className="pointer-events-none absolute bottom-[12%] right-3 top-[18%] z-[2] hidden w-14 flex-col items-end justify-between xl:flex 2xl:right-6 2xl:w-16"
        aria-hidden
      >
        <div className="h-24 w-px bg-gradient-to-b from-transparent via-lime/40 to-transparent" />
        <div className="flex flex-1 flex-col justify-center gap-2 overflow-hidden">
          {SIDE_CHIPS.slice(6).map((c) => (
            <span key={c} className="font-mono text-[9px] tracking-[0.18em] text-lime/35" style={{ writingMode: 'vertical-rl' }}>
              {c}
            </span>
          ))}
        </div>
      </aside>

      {/* Floating status chips — alive without cluttering mobile */}
      <div className="pointer-events-none absolute right-[8%] top-[22%] z-[2] hidden flex-col gap-2 lg:flex" aria-hidden>
        {['FIAT PLANE · READY', 'PROTOCOL · ARMED', 'RANK · OPEN'].map((t) => (
          <span
            key={t}
            className="border border-line/60 bg-panel/50 px-2.5 py-1.5 font-mono text-[10px] tracking-wider text-mute backdrop-blur-md"
          >
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_8px_#c4f000]" />
            {t}
          </span>
        ))}
      </div>

      {/* Copy — wider container, left-weighted but not a thin column */}
      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[1400px] flex-col justify-center px-5 pb-16 pt-24 sm:px-8 lg:px-12 xl:px-16">
        <div className="max-w-3xl xl:max-w-4xl">
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-lime-dim">INTAFACED · SOVEREIGN OS</p>
          <SplitHeading
            className="max-w-[14ch] text-[clamp(2.5rem,6.5vw,4.75rem)] drop-shadow-[0_2px_28px_rgba(5,8,6,0.9)]"
            accentLine={1}
            lines={['WEB2 RAILS IN.', 'WEB3 SETTLEMENT OUT.', 'INTELLIGENCE BINDING THEM.']}
          />
          <p className="mt-5 max-w-[40ch] text-base text-mute md:text-lg">
            Twelve rooms. Two planes. One identity, one ledger, one token — and one key that opens every door.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#key"
              className="bg-lime px-5 py-3 text-xs font-extrabold tracking-[0.06em] text-[#081008] shadow-[0_0_32px_rgba(196,240,0,0.22)]"
            >
              ENTER THE CHAIN
            </a>
            <a
              href="#rooms"
              className="border border-line/80 bg-void/50 px-5 py-3 text-xs font-extrabold tracking-[0.06em] text-ink backdrop-blur-sm hover:border-lime-dim"
            >
              SEE ALL TWELVE ROOMS
            </a>
          </div>
          <ul className="mt-10 grid max-w-3xl grid-cols-3 gap-2 sm:grid-cols-6">
            {[
              [12, 'Modules'],
              [28, 'Products'],
              [30, 'Streams'],
              [10, 'Agents'],
              [2, 'Planes'],
              [1, 'Chain'],
            ].map(([n, label]) => (
              <li key={String(label)} className="border border-line/70 bg-panel/60 p-2.5 backdrop-blur-md">
                <strong className="block font-mono text-xl text-lime">
                  <NumberTicker value={n as number} />
                </strong>
                <em className="text-[9px] not-italic uppercase tracking-[0.1em] text-mute">{label as string}</em>
              </li>
            ))}
          </ul>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
            They built rooms. We built the house. Then we built the ground under it.
          </p>
        </div>
      </div>
    </section>
  );
}
