/**
 * Official INTAFACED mark (three offset blocks) + wordmark.
 * Assets: public/brand/ from Documents/intafaced branding.
 * Lime token aligned to brand kit #c4f000 for the mark fill.
 */

type Props = {
  className?: string;
  compact?: boolean;
  /** mark only — no text */
  markOnly?: boolean;
  /** larger for boot/loader */
  size?: 'sm' | 'md' | 'lg';
};

const markSize = {
  sm: 'h-5 w-6',
  md: 'h-7 w-8',
  lg: 'h-12 w-14',
} as const;

/** Inline SVG — no FOUC, works offline / first paint */
export function LogoMark({ className = '', size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 100"
      className={[markSize[size], 'shrink-0 text-[#c4f000]', className].filter(Boolean).join(' ')}
      fill="currentColor"
      aria-hidden
    >
      <rect x="0" y="0" width="61" height="62" rx="4" />
      <rect x="80" y="22" width="39" height="40" rx="3.5" />
      <rect x="52" y="74" width="27" height="26" rx="3" />
    </svg>
  );
}

export function BrandMark({ className = '', compact = false, markOnly = false, size }: Props) {
  const s = size ?? (compact ? 'sm' : 'md');
  return (
    <span
      className={['inline-flex items-center gap-2 font-extrabold tracking-tight text-ink', className].filter(Boolean).join(' ')}
      aria-label="INTAFACED"
    >
      <LogoMark size={s} />
      {markOnly ? null : (
        <span className={compact ? 'text-sm' : s === 'lg' ? 'text-2xl' : 'text-base'}>
          INTA<span className="text-lime">FACED</span>
        </span>
      )}
    </span>
  );
}
