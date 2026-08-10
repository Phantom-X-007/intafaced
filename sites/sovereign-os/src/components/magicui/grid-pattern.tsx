import { cn } from '@/lib/utils';

export function GridPattern({ className }: { className?: string }) {
  return (
    <div
      className={cn('pointer-events-none absolute inset-0', className)}
      style={{
        backgroundImage: `
          linear-gradient(to right, color-mix(in srgb, var(--color-line) 70%, transparent) 1px, transparent 1px),
          linear-gradient(to bottom, color-mix(in srgb, var(--color-line) 70%, transparent) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
        maskImage: 'radial-gradient(ellipse 70% 55% at 50% 0%, black 10%, transparent 70%)',
      }}
    />
  );
}
