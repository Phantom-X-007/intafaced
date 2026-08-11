/**
 * Aceternity Glare Card — own-the-code port from
 * https://ui.aceternity.com/components/glare-card
 * (Linear-style foil glare on pointer). Themed for INTAFACED void/lime.
 */
import { cn } from '@/lib/utils';
import { useRef, type CSSProperties, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Inner content surface classes */
  className?: string;
  /** Outer shell (size / spacing) */
  containerClassName?: string;
};

export function GlareCard({ children, className, containerClassName }: Props) {
  const isPointerInside = useRef(false);
  const refElement = useRef<HTMLDivElement>(null);
  const state = useRef({
    glare: { x: 50, y: 50 },
    background: { x: 50, y: 50 },
    rotate: { x: 0, y: 0 },
  });

  const containerStyle = {
    '--m-x': '50%',
    '--m-y': '50%',
    '--r-x': '0deg',
    '--r-y': '0deg',
    '--bg-x': '50%',
    '--bg-y': '50%',
    '--duration': '300ms',
    '--foil-size': '100%',
    '--opacity': '0',
    '--radius': '12px',
    '--easing': 'ease',
    '--transition': 'var(--duration) var(--easing)',
  } as CSSProperties;

  const backgroundStyle = {
    '--step': '5%',
    '--foil-svg': `url("data:image/svg+xml,%3Csvg width='26' height='26' viewBox='0 0 26 26' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M2.99994 3.419C2.99994 3.419 21.6142 7.43646 22.7921 12.153C23.97 16.8695 3.41838 23.0306 3.41838 23.0306' stroke='white' stroke-width='5' stroke-miterlimit='3.86874' stroke-linecap='round' style='mix-blend-mode:darken'/%3E%3C/svg%3E")`,
    '--pattern': 'var(--foil-svg) center/100% no-repeat',
    // Rainbow kept subtle in foil layer; brand still reads void/lime under it
    '--rainbow':
      'repeating-linear-gradient( 0deg,rgb(196,240,0) calc(var(--step) * 1),rgba(255,237,95,1) calc(var(--step) * 2),rgba(168,255,95,1) calc(var(--step) * 3),rgba(131,255,247,1) calc(var(--step) * 4),rgba(120,148,255,1) calc(var(--step) * 5),rgb(216,117,255) calc(var(--step) * 6),rgb(196,240,0) calc(var(--step) * 7) ) 0% var(--bg-y)/200% 700% no-repeat',
    '--diagonal':
      'repeating-linear-gradient( 128deg,#050806 0%,hsl(100,12%,28%) 3.8%,hsl(100,12%,28%) 4.5%,hsl(100,12%,28%) 5.2%,#050806 10%,#050806 12% ) var(--bg-x) var(--bg-y)/300% no-repeat',
    '--shade':
      'radial-gradient( farthest-corner circle at var(--m-x) var(--m-y),rgba(255,255,255,0.1) 12%,rgba(255,255,255,0.15) 20%,rgba(255,255,255,0.25) 120% ) var(--bg-x) var(--bg-y)/300% no-repeat',
    backgroundBlendMode: 'hue, hue, hue, overlay',
  } as CSSProperties;

  const updateStyles = () => {
    const el = refElement.current;
    if (!el) return;
    const { background, rotate, glare } = state.current;
    el.style.setProperty('--m-x', `${glare.x}%`);
    el.style.setProperty('--m-y', `${glare.y}%`);
    el.style.setProperty('--r-x', `${rotate.x}deg`);
    el.style.setProperty('--r-y', `${rotate.y}deg`);
    el.style.setProperty('--bg-x', `${background.x}%`);
    el.style.setProperty('--bg-y', `${background.y}%`);
  };

  return (
    <div
      style={containerStyle}
      className={cn(
        // Default playable size; override with containerClassName (card-game layout uses ~380–420)
        'relative isolate w-full max-w-[min(100%,420px)] [aspect-ratio:17/21] transition-transform delay-[var(--delay)] duration-[var(--duration)] ease-[var(--easing)] will-change-transform [contain:layout_style] [perspective:900px]',
        containerClassName,
      )}
      ref={refElement}
      onPointerMove={(event) => {
        // Stronger tilt than stock Aceternity — more “physical pass” feel
        const rotateFactor = 0.72;
        const rect = event.currentTarget.getBoundingClientRect();
        const position = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
        const percentage = {
          x: (100 / rect.width) * position.x,
          y: (100 / rect.height) * position.y,
        };
        const delta = {
          x: percentage.x - 50,
          y: percentage.y - 50,
        };

        const { background, rotate, glare } = state.current;
        background.x = 50 + percentage.x / 4 - 12.5;
        background.y = 50 + percentage.y / 3 - 16.67;
        rotate.x = -(delta.x / 3.5) * rotateFactor;
        rotate.y = (delta.y / 2) * rotateFactor;
        glare.x = percentage.x;
        glare.y = percentage.y;
        updateStyles();
      }}
      onPointerEnter={() => {
        isPointerInside.current = true;
        if (refElement.current) {
          window.setTimeout(() => {
            if (isPointerInside.current) {
              refElement.current?.style.setProperty('--duration', '0s');
            }
          }, 300);
        }
      }}
      onPointerLeave={() => {
        isPointerInside.current = false;
        if (refElement.current) {
          refElement.current.style.removeProperty('--duration');
          refElement.current.style.setProperty('--r-x', '0deg');
          refElement.current.style.setProperty('--r-y', '0deg');
        }
      }}
    >
      <div className="grid h-full origin-center overflow-hidden rounded-[var(--radius)] border border-line transition-transform delay-[var(--delay)] duration-[var(--duration)] ease-[var(--easing)] will-change-transform [transform:rotateY(var(--r-x))_rotateX(var(--r-y))] hover:filter-none hover:[--duration:200ms] hover:[--easing:linear] hover:[--opacity:0.65]">
        <div className="grid h-full w-full mix-blend-soft-light [clip-path:inset(0_0_0_0_round_var(--radius))] [grid-area:1/1]">
          <div className={cn('relative h-full w-full bg-[#050806]', className)}>{children}</div>
        </div>
        <div className="transition-background will-change-background grid h-full w-full opacity-[var(--opacity)] mix-blend-soft-light transition-opacity delay-[var(--delay)] duration-[var(--duration)] ease-[var(--easing)] [background:radial-gradient(farthest-corner_circle_at_var(--m-x)_var(--m-y),_rgba(255,255,255,0.8)_10%,_rgba(255,255,255,0.65)_20%,_rgba(255,255,255,0)_90%)] [clip-path:inset(0_0_1px_0_round_var(--radius))] [grid-area:1/1]" />
        <div
          className="will-change-background after:grid-area-[inherit] after:bg-repeat-[inherit] after:bg-attachment-[inherit] after:bg-origin-[inherit] after:bg-clip-[inherit] relative grid h-full w-full opacity-[var(--opacity)] [background-blend-mode:hue_hue_hue_overlay] mix-blend-color-dodge transition-opacity [background:var(--pattern),_var(--rainbow),_var(--diagonal),_var(--shade)] [clip-path:inset(0_0_1px_0_round_var(--radius))] [grid-area:1/1] after:bg-[inherit] after:[background-size:var(--foil-size),_200%_400%,_800%,_200%] after:[background-position:center,_0%_var(--bg-y),_calc(var(--bg-x)*_-1)_calc(var(--bg-y)*_-1),_var(--bg-x)_var(--bg-y)] after:[background-blend-mode:soft-light,_hue,_hard-light] after:mix-blend-exclusion after:content-['']"
          style={backgroundStyle}
        />
      </div>
    </div>
  );
}
