import { BrandMark } from '@/components/BrandMark';
import { detectWebGL } from '@/components/hero/webglDetect';
import { useEffect, useRef, useState } from 'react';

type Props = {
  children: React.ReactNode;
};

/**
 * Brand boot overlay.
 *
 * Anti black-flash contract:
 * 1. Children mount immediately under the overlay (always painted).
 * 2. Only the overlay opacity changes — never fade children to 0.
 * 3. Overlay stays in DOM until fade completes, then unmounts.
 * 4. First HTML paint uses the same void + mark (see index.html #boot).
 */
export function SiteLoader({ children }: Props) {
  const [overlay, setOverlay] = useState(true);
  const [fading, setFading] = useState(false);
  const [pct, setPct] = useState(0);
  const [line, setLine] = useState('CUTTING THE KEY…');
  const [reduceMotion, setReduceMotion] = useState(false);
  const finished = useRef(false);

  useEffect(() => {
    // Remove static HTML boot shell once React owns the paint
    document.getElementById('boot')?.remove();

    let cancelled = false;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReduceMotion(reduce);
    const lines = reduce ? ['OPENING LOBBY…'] : ['CUTTING THE KEY…', 'MOUNTING PLANES…', 'WARMING WAVE GRID…', 'OPENING LOBBY…'];
    let li = 0;
    const lineTimer = window.setInterval(
      () => {
        li = (li + 1) % lines.length;
        setLine(lines[li]!);
      },
      reduce ? 99999 : 480,
    );

    let p = 0;
    const tick = window.setInterval(
      () => {
        p = Math.min(p + (p < 70 ? 6 : 2), 92);
        setPct(Math.floor(p));
      },
      reduce ? 30 : 40,
    );

    const finish = () => {
      if (cancelled || finished.current) return;
      finished.current = true;
      window.clearInterval(tick);
      window.clearInterval(lineTimer);
      setPct(100);
      setLine('SEE YOU IN THE LOBBY');
      window.setTimeout(
        () => {
          if (cancelled) return;
          setFading(true);
          const fadeMs = reduce ? 120 : 480;
          window.setTimeout(() => {
            if (!cancelled) setOverlay(false);
          }, fadeMs);
        },
        reduce ? 40 : 180,
      );
    };

    const preload = async () => {
      try {
        if (detectWebGL() && !reduce) {
          await import('@/components/hero/waveGridEngine');
        }
      } catch {
        /* optional */
      }
    };

    const minWait = new Promise<void>((r) => window.setTimeout(r, reduce ? 220 : 700));
    void Promise.all([preload(), minWait]).then(finish);

    return () => {
      cancelled = true;
      window.clearInterval(tick);
      window.clearInterval(lineTimer);
    };
  }, []);

  return (
    <div className="relative min-h-dvh bg-void">
      {/* Content always fully opaque under the boot layer */}
      <div className="relative z-0 min-h-dvh" style={{ opacity: 1 }}>
        {children}
      </div>

      {overlay ? (
        <div
          className={[
            'fixed inset-0 z-[100] flex flex-col items-center justify-center bg-void',
            'transition-opacity ease-out',
            fading ? 'pointer-events-none opacity-0' : 'opacity-100 duration-0',
          ].join(' ')}
          style={fading ? { transitionDuration: reduceMotion ? '120ms' : '480ms' } : undefined}
          aria-busy={!fading}
          aria-live="polite"
          role="status"
        >
          <div className="absolute inset-0 opacity-30" aria-hidden>
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(26,38,31,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(26,38,31,0.9) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
                maskImage: 'radial-gradient(ellipse 60% 50% at 50% 50%, black, transparent)',
              }}
            />
          </div>
          <div className="relative z-10 w-[min(360px,86vw)] text-center">
            <div className="flex justify-center">
              <BrandMark size="lg" className="justify-center" />
            </div>
            <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-lime">{line}</p>
            <div className="mt-5 h-[2px] w-full overflow-hidden bg-line">
              <div
                className="h-full bg-lime shadow-[0_0_16px_rgba(196,240,0,0.45)] transition-[width] duration-100 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-3 font-mono text-[10px] tabular-nums tracking-widest text-mute">{String(pct).padStart(3, '0')}%</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
