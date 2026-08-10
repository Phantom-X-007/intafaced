import { SplitHeading } from '@/components/bits/split-heading';
import { NumberTicker } from '@/components/magicui/number-ticker';
import { lazy, Suspense, useEffect, useState } from 'react';
import { HeroFallback } from './HeroFallback';
import { detectWebGL } from './webglDetect';

const HeroWaveCanvas = lazy(() => import('./HeroWaveCanvas').then((m) => ({ default: m.HeroWaveCanvas })));

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduce(mq.matches);
    const fn = () => setReduce(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return reduce;
}

/**
 * Premium hero: full MIT wave-grid (desktop/GPU) + intentional fallback.
 * Does not strip the effect — scales quality, never ships a dead empty hero.
 */
export function HeroSection() {
  const reduce = useReducedMotion();
  const [want3d, setWant3d] = useState(false);

  useEffect(() => {
    // Enable 3D when WebGL exists and motion OK — including mobile (low quality)
    if (!reduce && detectWebGL()) setWant3d(true);
  }, [reduce]);

  return (
    <section id="top" className="relative min-h-[min(94vh,900px)] overflow-hidden border-b border-line">
      {/* Layer 0: 3D or fallback */}
      {want3d ? (
        <Suspense fallback={<HeroFallback />}>
          <HeroWaveCanvas active className="absolute inset-0 z-0" />
        </Suspense>
      ) : (
        <HeroFallback />
      )}

      {/* Readability scrims — keep premium depth, protect type */}
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-r from-void/90 via-void/55 to-void/25" aria-hidden />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-void via-transparent to-void/50" aria-hidden />

      {/* Copy / CTAs */}
      <div className="relative z-10 mx-auto flex min-h-[min(94vh,900px)] max-w-5xl flex-col justify-center px-4 pb-12 pt-20 md:px-6 md:pt-24">
        <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-lime-dim">INTAFACED · SOVEREIGN OS</p>
        <SplitHeading
          className="max-w-[12ch] text-[clamp(2.4rem,7vw,4.4rem)] drop-shadow-[0_2px_24px_rgba(5,8,6,0.85)]"
          accentLine={1}
          lines={['WEB2 RAILS IN.', 'WEB3 SETTLEMENT OUT.', 'INTELLIGENCE BINDING THEM.']}
        />
        <p className="mt-5 max-w-[36ch] text-base text-mute md:text-lg">
          Twelve rooms. Two planes. One identity, one ledger, one token — and one key that opens every door.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a
            href="#key"
            className="bg-lime px-5 py-3 text-xs font-extrabold tracking-[0.06em] text-[#081008] shadow-[0_0_32px_rgba(198,255,61,0.22)]"
          >
            ENTER THE CHAIN
          </a>
          <a
            href="#rooms"
            className="border border-line/80 bg-void/40 px-5 py-3 text-xs font-extrabold tracking-[0.06em] text-ink backdrop-blur-sm hover:border-lime-dim"
          >
            SEE ALL TWELVE ROOMS
          </a>
        </div>
        <ul className="mt-10 grid max-w-2xl grid-cols-3 gap-2 md:grid-cols-6">
          {[
            [12, 'Modules'],
            [28, 'Products'],
            [30, 'Streams'],
            [10, 'Agents'],
            [2, 'Planes'],
            [1, 'Chain'],
          ].map(([n, label]) => (
            <li key={String(label)} className="border border-line/80 bg-panel/70 p-2.5 backdrop-blur-sm">
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
        {want3d ? (
          <p className="mt-3 font-mono text-[9px] tracking-wide text-mute/70">
            Interactive wave grid · move pointer · MIT franky-adl/3d-wave-grid
          </p>
        ) : null}
      </div>
    </section>
  );
}
