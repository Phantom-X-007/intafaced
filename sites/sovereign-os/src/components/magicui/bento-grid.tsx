import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function BentoGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid auto-rows-[minmax(110px,auto)] grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6', className)}>{children}</div>
  );
}

export function BentoCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden rounded-[3px] border border-line bg-panel p-3 transition hover:border-lime-dim hover:-translate-y-0.5',
        className,
      )}
    >
      {children}
    </div>
  );
}
