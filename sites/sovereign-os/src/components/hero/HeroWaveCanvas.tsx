import { useEffect, useRef, useState } from 'react';
import { detectWebGL } from './webglDetect';
import type { WaveGridEngine as EngineType } from './waveGridEngine';

type Props = {
  active: boolean;
  className?: string;
  onReady?: () => void;
};

/**
 * Wave-grid canvas. Fades in after first frames so cold shader compile
 * never flashes as a jank pop-in.
 */
export function HeroWaveCanvas({ active, className, onReady }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EngineType | null>(null);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    if (!detectWebGL()) {
      setFailed(true);
      return;
    }

    let cancelled = false;
    let engine: EngineType | null = null;
    let readyTimer: number | undefined;

    (async () => {
      try {
        const { WaveGridEngine, pickQuality } = await import('./waveGridEngine');
        if (cancelled) return;
        engine = new WaveGridEngine({
          canvas,
          quality: pickQuality(),
          // Full hero section hitbox so cursor waves track across copy + atmosphere
          pointerRoot: wrap.closest('section') ?? wrap.parentElement,
        });
        if (cancelled) {
          engine.dispose();
          return;
        }
        engineRef.current = engine;
        engine.start();
        // Let 2–3 frames compile/warm shaders, then fade in
        readyTimer = window.setTimeout(() => {
          if (cancelled) return;
          setVisible(true);
          onReady?.();
        }, 140);
      } catch {
        if (!cancelled) setFailed(true);
        engine?.dispose();
      }
    })();

    const io = new IntersectionObserver(
      ([entry]) => {
        engineRef.current?.setVisible(entry.isIntersecting && !document.hidden);
      },
      { threshold: 0.05 },
    );
    io.observe(wrap);

    const onVis = () => {
      const inView = wrap.getBoundingClientRect().bottom > 0 && wrap.getBoundingClientRect().top < window.innerHeight;
      engineRef.current?.setVisible(inView && !document.hidden);
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      if (readyTimer) window.clearTimeout(readyTimer);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [active, onReady]);

  if (failed) return null;

  return (
    <div ref={wrapRef} className={className} aria-hidden>
      <canvas
        ref={canvasRef}
        className={['absolute inset-0 h-full w-full transition-opacity duration-700 ease-out', visible ? 'opacity-100' : 'opacity-0'].join(
          ' ',
        )}
        style={{ pointerEvents: 'none' }}
      />
    </div>
  );
}
