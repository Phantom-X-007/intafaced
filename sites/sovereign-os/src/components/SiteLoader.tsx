import { BrandMark } from '@/components/BrandMark';
import { detectWebGL } from '@/components/hero/webglDetect';
import { useEffect, useRef, useState } from 'react';

type Props = {
  children: React.ReactNode;
};

/**
 * Brand boot overlay. Content stays mounted + fully visible underneath.
 * Only the overlay fades out — never both layers at opacity 0 (black flash bug).
 * Preloads Three while overlay is up.
 */
export function SiteLoader({ children }: Props) {
  const [overlay, setOverlay] = useState(true);
  const [fading, setFading] = useState(false);
  const [pct, setPct] = useState(0);
  const [line, setLine] = useState('CUTTING THE KEY…');
  const finished = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const lines = ['CUTTING THE KEY…', 'MOUNTING PLANES…', 'WARMING WAVE GRID…', 'OPENING LOBBY…'];
    let li = 0;
    const lineTimer = window.setInterval(() => {
      li = (li + 1) % lines.length;
      setLine(lines[li]);
    }, 480);

    let p = 0;
    const tick = window.setInterval(() => {
      p = Math.min(p + (p < 70 ? 5 : 1.5), 90);
      setPct(Math.floor(p));
    }, 45);

    const finish = () => {
      if (cancelled || finished.current) return;
      finished.current = true;
      window.clearInterval(tick);
      window.clearInterval(lineTimer);
      setPct(100);
      setLine('SEE YOU IN THE LOBBY');
      window.setTimeout(() => {
        if (cancelled) return;
        setFading(true);
        window.setTimeout(() => {
          if (!cancelled) setOverlay(false);
        }, 450);
      }, 200);
    };

    const preload = async () => {
      try {
        if (detectWebGL() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          await import('@/components/hero/waveGridEngine');
        }
      } catch {
        /* ok */
      }
    };

    const minWait = new Promise((r) => window.setTimeout(r, 750));
    void Promise.all([preload(), minWait]).then(finish);

    return () => {
      cancelled = true;
      window.clearInterval(tick);
      window.clearInterval(lineTimer);
    };
  }, []);

  return (
    <div className="relative min-h-dvh bg-void">
      <div className="relative z-0 min-h-dvh">{children}</div>

      {overlay ? (
        <div
          className={[
            'fixed inset-0 z-[100] flex flex-col items-center justify-center bg-void',
            'transition-opacity duration-[450ms] ease-out',
            fading ? 'pointer-events-none opacity-0' : 'opacity-100',
          ].join(' ')}
          aria-busy={!fading}
          aria-live="polite"
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
            <BrandMark className="justify-center" />
            <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-lime">{line}</p>
            <div className="mt-5 h-[2px] w-full overflow-hidden bg-line">
              <div
                className="h-full bg-lime shadow-[0_0_16px_rgba(198,255,61,0.45)] transition-[width] duration-100 ease-out"
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
