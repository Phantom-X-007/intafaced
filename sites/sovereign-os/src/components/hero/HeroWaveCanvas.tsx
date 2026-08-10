import { useEffect, useRef, useState } from 'react';
import { detectWebGL } from './webglDetect';
import type { WaveGridEngine as EngineType } from './waveGridEngine';

type Props = {
  active: boolean;
  className?: string;
};

export function HeroWaveCanvas({ active, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EngineType | null>(null);
  const [failed, setFailed] = useState(false);

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

    (async () => {
      try {
        const { WaveGridEngine, pickQuality } = await import('./waveGridEngine');
        if (cancelled) return;
        engine = new WaveGridEngine({
          canvas,
          quality: pickQuality(),
          pointerRoot: wrap.parentElement,
        });
        if (cancelled) {
          engine.dispose();
          return;
        }
        engineRef.current = engine;
        engine.start();
      } catch {
        if (!cancelled) setFailed(true);
        engine?.dispose();
      }
    })();

    const io = new IntersectionObserver(
      ([entry]) => {
        engineRef.current?.setVisible(entry.isIntersecting);
      },
      { threshold: 0.05 },
    );
    io.observe(wrap);

    return () => {
      cancelled = true;
      io.disconnect();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [active]);

  if (failed) return null;

  return (
    <div ref={wrapRef} className={className} aria-hidden>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ pointerEvents: 'none' }} />
    </div>
  );
}
