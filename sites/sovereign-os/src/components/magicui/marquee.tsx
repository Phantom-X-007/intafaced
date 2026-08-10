import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function Marquee({
  children,
  className,
  reverse = false,
  pauseOnHover = false,
}: {
  children: ReactNode;
  className?: string;
  reverse?: boolean;
  pauseOnHover?: boolean;
}) {
  return (
    <div className={cn('group flex overflow-hidden [--duration:45s] [--gap:1rem]', className)}>
      <div
        className={cn(
          'flex min-w-full shrink-0 items-center gap-[var(--gap)] animate-marquee',
          reverse && '[animation-direction:reverse]',
          pauseOnHover && 'group-hover:[animation-play-state:paused]',
        )}
      >
        {children}
      </div>
      <div
        className={cn(
          'flex min-w-full shrink-0 items-center gap-[var(--gap)] animate-marquee',
          reverse && '[animation-direction:reverse]',
          pauseOnHover && 'group-hover:[animation-play-state:paused]',
        )}
        aria-hidden
      >
        {children}
      </div>
    </div>
  );
}
