import type { ReactNode } from 'react';

export type ChipTone = 'live' | 'dark' | 'danger' | 'warn' | 'info' | 'neutral';

export interface ChipProps {
  tone?: ChipTone;
  dot?: boolean;
  title?: string;
  children: ReactNode;
}

/**
 * The one status pill in the console. Tone maps to a token, never to a hex:
 * live/dark are phosphor and faint, danger is `--if-short`, warn is `--if-warn`.
 */
export function Chip({ tone = 'neutral', dot = false, title, children }: ChipProps) {
  return (
    <span className="adm-chip" data-tone={tone} title={title}>
      {dot && <span className="adm-chip__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
