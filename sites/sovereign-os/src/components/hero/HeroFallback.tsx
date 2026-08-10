import { BackgroundBeams } from '@/components/bits/background-beams';
import { GridPattern } from '@/components/magicui/grid-pattern';

/** Intentional premium fallback — not a blank void */
export function HeroFallback() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-void" />
      <GridPattern className="opacity-50" />
      <BackgroundBeams />
      {/* CSS faux grid for depth without WebGL */}
      <div
        className="absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(196,240,0,0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(196,240,0,0.07) 1px, transparent 1px)
          `,
          backgroundSize: '28px 28px',
          transform: 'perspective(600px) rotateX(58deg) scale(1.6)',
          transformOrigin: 'center 70%',
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 25%, black 70%, transparent 100%)',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent" />
    </div>
  );
}
