import { cn } from '@/lib/utils';
import { useRef, type MouseEvent, type ReactNode } from 'react';

/** Aceternity/React Bits style spotlight card — lime spotlight */
export function SpotlightCard({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(e: MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--sx', `${e.clientX - r.left}px`);
    el.style.setProperty('--sy', `${e.clientY - r.top}px`);
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      className={cn(
        'relative overflow-hidden rounded-[3px] border border-line bg-panel p-5',
        'before:pointer-events-none before:absolute before:inset-0 before:opacity-0 before:transition-opacity hover:before:opacity-100',
        'before:bg-[radial-gradient(320px_circle_at_var(--sx,50%)_var(--sy,50%),rgba(198,255,61,0.12),transparent_55%)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
