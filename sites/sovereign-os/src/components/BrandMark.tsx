/**
 * INTAFACED wordmark — lime on FACED.
 * When Google brand kit SVG is provided, drop it in public/brand/ and render here.
 */
export function BrandMark({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span
      className={['inline-flex items-baseline font-extrabold tracking-tight text-ink', compact ? 'text-base' : 'text-2xl', className]
        .filter(Boolean)
        .join(' ')}
      aria-label="INTAFACED"
    >
      INTA<span className="text-lime">FACED</span>
    </span>
  );
}
