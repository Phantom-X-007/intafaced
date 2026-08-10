import { cn } from '@/lib/utils';

/** Magic UI–style border beam (lime). Border-only mask — does not cover content. */
export function BorderBeam({ className, duration = 8 }: { className?: string; duration?: number }) {
  return (
    <div
      className={cn('pointer-events-none absolute inset-0 rounded-[inherit]', className)}
      style={{
        padding: '1px',
        background: 'conic-gradient(from var(--beam-angle, 0deg), transparent 0 75%, #c4f000 88%, transparent 100%)',
        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
        maskComposite: 'exclude',
        animation: `border-beam ${duration}s linear infinite`,
      }}
    />
  );
}
