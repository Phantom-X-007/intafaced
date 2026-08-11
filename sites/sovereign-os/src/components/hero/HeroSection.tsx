import { SplitHeading } from '@/components/bits/split-heading';
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

/** Editorial exchange hero - no terminal (terminal lives below). */
export function HeroSection() {
  const reduce = useReducedMotion();
  const [want3d, setWant3d] = useState(false);

  useEffect(() => {
    setWant3d(!reduce && detectWebGL());
  }, [reduce]);

  return (
    <section className="relative min-h-[100dvh] w-full overflow-hidden border-b border-line">
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

      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-void/70 via-void/30 to-void/85" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_75%_65%_at_28%_42%,rgba(5,8,6,0.55),transparent_62%)]"
        aria-hidden
      />

      {/* Live-feel metric floats - not a second terminal */}
      <div className="pointer-events-none absolute right-[6%] top-[22%] z-[2] hidden w-[200px] flex-col gap-2 xl:flex" aria-hidden>
        {[
          { k: 'BTC-PERP', v: '67,412', c: '+2.4%' },
          { k: 'ETH-PERP', v: '3,412', c: '+1.1%' },
          { k: 'Funding', v: '+0.012%', c: '8h' },
        ].map((row) => (
          <div key={row.k} className="border border-line/60 bg-panel/55 px-3 py-2 font-mono text-[10px] backdrop-blur-md">
            <div className="flex items-center justify-between gap-3">
              <span className="text-mute">{row.k}</span>
              <span className="text-lime">{row.c}</span>
            </div>
            <div className="mt-0.5 text-sm font-bold tracking-tight text-ink">{row.v}</div>
          </div>
        ))}
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[1400px] flex-col justify-center px-5 pb-16 pt-24 sm:px-8 lg:px-12 xl:px-16">
        <div className="max-w-3xl">
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-lime-dim">INTAFACED · EXCHANGE</p>
          <SplitHeading
            className="max-w-[11ch] text-[clamp(2.6rem,6.8vw,4.85rem)] drop-shadow-[0_2px_28px_rgba(5,8,6,0.9)]"
            accentLine={1}
            lines={['ONE EXCHANGE', 'ONE TERMINAL', 'EVERY MARKET']}
          />
          <p className="mt-5 max-w-[38ch] text-base leading-relaxed text-mute md:text-lg">
            Spot, perps, options, and OTC on one desk - charts, depth, and tickets together. One identity. One ledger.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#trade"
              className="bg-lime px-5 py-3 text-xs font-extrabold tracking-[0.06em] text-[#081008] shadow-[0_0_32px_rgba(196,240,0,0.22)] active:scale-[0.98]"
            >
              OPEN THE TERMINAL
            </a>
            <a
              href="#rooms"
              className="border border-line/80 bg-void/50 px-5 py-3 text-xs font-extrabold tracking-[0.06em] text-ink backdrop-blur-sm hover:border-lime-dim active:scale-[0.98]"
            >
              SEE THE FULL HOUSE
            </a>
          </div>
          <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.12em] text-mute">
            Markets first · OS under them · preview numbers
          </p>
        </div>
      </div>
    </section>
  );
}
