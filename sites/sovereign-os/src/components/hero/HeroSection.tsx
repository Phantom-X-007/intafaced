import { SplitHeading } from '@/components/bits/split-heading';
import { HeroDesk } from '@/components/exchange/HeroDesk';
import { MarketPills } from '@/components/exchange/MarketPills';
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

const SIDE_CHIPS = ['SPOT', 'PERPS', 'OPTIONS', 'OTC', 'DEPTH', 'CHARTS', 'MARGIN', 'FUNDING', 'PROTOCOL', 'P2P', 'TOKEN', 'AGENTS'];

/**
 * Exchange-hero: copy (audited) + live-looking desk chrome + restored density.
 * H1 has no trailing periods. Exchange first; OS secondary CTA only.
 */
export function HeroSection() {
  const reduce = useReducedMotion();
  const [want3d, setWant3d] = useState(false);

  useEffect(() => {
    setWant3d(!reduce && detectWebGL());
  }, [reduce]);

  return (
    <section className="relative min-h-[100dvh] w-full overflow-hidden border-b border-line">
      {/* Atmosphere */}
      <div className="absolute inset-0 z-0">
        {want3d ? (
          <Suspense fallback={<HeroFallback />}>
            <HeroWaveCanvas active className="absolute inset-0" />
            <div className="absolute inset-0 -z-10">
              <HeroFallback />
            </div>
          </Suspense>
        ) : (
          <HeroFallback />
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-void/75 via-void/30 to-void/90" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_70%_60%_at_25%_40%,rgba(5,8,6,0.5),transparent_60%)]"
        aria-hidden
      />

      {/* Side rails */}
      <aside
        className="pointer-events-none absolute bottom-[12%] left-3 top-[18%] z-[2] hidden w-12 flex-col justify-between 2xl:flex 2xl:left-5"
        aria-hidden
      >
        <div className="flex flex-1 flex-col justify-center gap-2 overflow-hidden">
          {SIDE_CHIPS.slice(0, 6).map((c) => (
            <span
              key={c}
              className="font-mono text-[9px] tracking-[0.18em] text-lime/30"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              {c}
            </span>
          ))}
        </div>
        <div className="h-20 w-px bg-gradient-to-b from-transparent via-lime/35 to-transparent" />
      </aside>
      <aside
        className="pointer-events-none absolute bottom-[12%] right-3 top-[18%] z-[2] hidden w-12 flex-col items-end justify-between 2xl:flex 2xl:right-5"
        aria-hidden
      >
        <div className="h-20 w-px bg-gradient-to-b from-transparent via-lime/35 to-transparent" />
        <div className="flex flex-1 flex-col justify-center gap-2 overflow-hidden">
          {SIDE_CHIPS.slice(6).map((c) => (
            <span key={c} className="font-mono text-[9px] tracking-[0.18em] text-lime/30" style={{ writingMode: 'vertical-rl' }}>
              {c}
            </span>
          ))}
        </div>
      </aside>

      {/* Status chips — product surface, not plane jargon */}
      <div className="pointer-events-none absolute right-[6%] top-[18%] z-[2] hidden flex-col gap-2 xl:flex" aria-hidden>
        {['SPOT', 'PERPS', 'DEPTH'].map((t) => (
          <span
            key={t}
            className="border border-line/60 bg-panel/55 px-2.5 py-1.5 font-mono text-[10px] tracking-[0.14em] text-mute backdrop-blur-md"
          >
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_8px_#c4f000]" />
            {t}
          </span>
        ))}
      </div>

      {/* Main — two column exchange hero */}
      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[1400px] flex-col justify-center gap-10 px-5 pb-14 pt-24 sm:px-8 lg:px-12 xl:flex-row xl:items-center xl:gap-12 xl:px-14">
        {/* Copy column */}
        <div className="max-w-xl shrink-0 xl:max-w-[520px]">
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-lime-dim">INTAFACED · EXCHANGE</p>

          <SplitHeading
            className="max-w-[11ch] text-[clamp(2.6rem,6.8vw,4.85rem)] drop-shadow-[0_2px_28px_rgba(5,8,6,0.9)]"
            accentLine={1}
            lines={['ONE EXCHANGE', 'ONE TERMINAL', 'EVERY MARKET']}
          />

          <p className="mt-5 max-w-[40ch] text-base leading-relaxed text-mute md:text-lg">
            Spot, perps, options, and OTC on one desk — charts, depth, and tickets together. One identity. One ledger.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#trade"
              className="bg-lime px-5 py-3 text-xs font-extrabold tracking-[0.06em] text-[#081008] shadow-[0_0_32px_rgba(196,240,0,0.22)]"
            >
              OPEN THE TERMINAL
            </a>
            <a
              href="#rooms"
              className="border border-line/80 bg-void/50 px-5 py-3 text-xs font-extrabold tracking-[0.06em] text-ink backdrop-blur-sm hover:border-lime-dim"
            >
              SEE THE FULL HOUSE
            </a>
          </div>

          <MarketPills />

          <ul className="mt-8 grid max-w-md grid-cols-3 gap-2">
            {[
              [4, 'Market types'],
              [12, 'Rooms'],
              [1, 'Login'],
            ].map(([n, label]) => (
              <li key={String(label)} className="border border-line/70 bg-panel/55 p-2.5 backdrop-blur-md">
                <strong className="block font-mono text-xl text-lime">
                  <NumberTicker value={n as number} />
                </strong>
                <em className="text-[9px] not-italic uppercase tracking-[0.1em] text-mute">{label as string}</em>
              </li>
            ))}
          </ul>

          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.1em] text-mute">Markets first · the OS runs under them</p>
        </div>

        {/* Desk column — the exchange face */}
        <div className="relative flex flex-1 justify-center xl:justify-end">
          <HeroDesk />
        </div>
      </div>
    </section>
  );
}
