import { useEffect, useState } from 'react';
import { detectWebGL } from '@/components/hero/webglDetect';

type Props = {
  children: React.ReactNode;
};

/**
 * Premium boot loader — brand mono + lime progress.
 * Preloads Three wave-grid chunk while visible so hero isn't cold-start lag.
 * Pattern family: Magic UI Terminal / progress loaders (brand-skinned).
 */
export function SiteLoader({ children }: Props) {
  const [phase, setPhase] = useState<'boot' | 'exit' | 'done'>('boot');
  const [pct, setPct] = useState(0);
  const [line, setLine] = useState('CUTTING THE KEY…');

  useEffect(() => {
    let cancelled = false;
    const lines = ['CUTTING THE KEY…', 'MOUNTING PLANES…', 'WARMING WAVE GRID…', 'OPENING LOBBY…'];
    let li = 0;
    const lineTimer = window.setInterval(() => {
      li = (li + 1) % lines.length;
      setLine(lines[li]);
    }, 480);

    // Smooth progress while we preload 3D
    let p = 0;
    const tick = window.setInterval(() => {
      p = Math.min(p + (p < 70 ? 4 : 1.2), 92);
      setPct(Math.floor(p));
    }, 40);

    const preload = async () => {
      try {
        if (detectWebGL() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          // Pull wave engine + three into cache before reveal
          await import('@/components/hero/waveGridEngine');
        }
      } catch {
        /* fallback path still fine */
      }
      if (cancelled) return;
      window.clearInterval(tick);
      setPct(100);
      setLine('SEE YOU IN THE LOBBY');
      window.setTimeout(() => {
        if (cancelled) return;
        setPhase('exit');
        window.setTimeout(() => {
          if (!cancelled) setPhase('done');
        }, 520);
      }, 220);
    };

    // Minimum boot time so it feels intentional, not a flash
    const minWait = new Promise((r) => window.setTimeout(r, 900));
    void Promise.all([preload(), minWait]).then(() => {
      if (!cancelled) {
        window.clearInterval(tick);
        setPct(100);
        setLine('SEE YOU IN THE LOBBY');
        window.setTimeout(() => {
          if (cancelled) return;
          setPhase('exit');
          window.setTimeout(() => {
            if (!cancelled) setPhase('done');
          }, 520);
        }, 180);
      }
    });

    return () => {
      cancelled = true;
      window.clearInterval(tick);
      window.clearInterval(lineTimer);
    };
  }, []);

  return (
    <>
      {phase !== 'done' ? (
        <div
          className={[
            'fixed inset-0 z-[100] flex flex-col items-center justify-center bg-void',
            'transition-opacity duration-500 ease-out',
            phase === 'exit' ? 'opacity-0 pointer-events-none' : 'opacity-100',
          ].join(' ')}
          aria-busy={phase === 'boot'}
          aria-live="polite"
        >
          <div className="absolute inset-0 opacity-30">
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
            <p className="font-extrabold tracking-tight text-ink">
              INTA<span className="text-lime">FACED</span>
            </p>
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
      <div className={phase === 'done' ? 'opacity-100 transition-opacity duration-500' : 'opacity-0'}>{children}</div>
    </>
  );
}
