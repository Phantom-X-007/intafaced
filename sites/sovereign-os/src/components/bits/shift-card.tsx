import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/** Cult UI–inspired shift card: more detail on hover */
export function ShiftCard({ title, blurb, detail, className }: { title: string; blurb: string; detail?: string; className?: string }) {
  return (
    <div
      className={cn(
        'group relative min-h-[120px] overflow-hidden rounded-[3px] border border-line bg-panel p-4 transition',
        'hover:border-lime-dim',
        className,
      )}
    >
      <h3 className="text-sm font-bold tracking-tight text-ink">{title}</h3>
      <p className="mt-1 text-sm text-mute transition group-hover:opacity-0">{blurb}</p>
      {detail ? (
        <p className="pointer-events-none absolute inset-x-4 bottom-4 translate-y-2 text-sm text-ink opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
          {detail}
        </p>
      ) : null}
    </div>
  );
}
