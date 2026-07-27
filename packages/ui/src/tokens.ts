/**
 * DESIGN TOKENS — LOCKED (§3 Phase 0 deliverable).
 *
 * Black glass / phosphor green. These values are the brand; components read
 * them and nothing hard-codes a hex outside this file. A colour that is not
 * here does not exist in the product.
 *
 * The CSS custom properties in tokens.css are generated from these same values
 * — see tokens.test.ts, which fails if the two ever drift apart.
 */

export const color = {
  /** Pure black. Not near-black. The whole surface treatment depends on it. */
  black: '#000000',

  /** Phosphor green — the single accent. CRT terminal, not neon mint. */
  phosphor: '#00FF41',
  phosphorDim: '#00B32D',
  phosphorGlow: 'rgba(0, 255, 65, 0.35)',

  /** Glass surfaces: translucent white over black, never grey fills. */
  glass: 'rgba(255, 255, 255, 0.03)',
  glassRaised: 'rgba(255, 255, 255, 0.06)',
  glassBorder: 'rgba(0, 255, 65, 0.15)',
  glassBorderStrong: 'rgba(0, 255, 65, 0.35)',

  text: '#E8FFE8',
  textMuted: 'rgba(232, 255, 232, 0.55)',
  textFaint: 'rgba(232, 255, 232, 0.32)',

  /** Market semantics. Long is the brand green; short is its opposite. */
  long: '#00FF41',
  short: '#FF3B5C',
  warn: '#FFB300',
  info: '#39C0ED',
} as const;

export const font = {
  /** Display / HUD — ranks, tickers, headings. */
  display: "'Orbitron', 'Rajdhani', system-ui, sans-serif",
  /** Body — everything a user reads in sentences. */
  body: "'Inter', system-ui, -apple-system, sans-serif",
  /** Numerics — order books, balances. Tabular figures are non-negotiable. */
  mono: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace",
} as const;

/** 4px base. Every gap in the OS is a multiple of it. */
export const space = {
  px: '1px',
  0.5: '2px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

export const radius = {
  none: '0',
  sm: '2px',
  md: '4px',
  lg: '8px',
  pill: '999px',
} as const;

export const border = {
  hairline: `1px solid ${color.glassBorder}`,
  strong: `1px solid ${color.glassBorderStrong}`,
} as const;

export const blur = {
  glass: 'blur(12px)',
  heavy: 'blur(24px)',
} as const;

export const shadow = {
  /** Phosphor bloom — used on active/live states only, never decoratively. */
  glow: `0 0 12px ${color.phosphorGlow}`,
  glowStrong: `0 0 24px ${color.phosphorGlow}`,
  panel: '0 8px 32px rgba(0, 0, 0, 0.6)',
} as const;

export const motion = {
  fast: '120ms cubic-bezier(0.4, 0, 0.2, 1)',
  base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '320ms cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

export const zIndex = {
  base: 0,
  panel: 10,
  overlay: 100,
  modal: 1000,
  toast: 2000,
} as const;

export const tokens = { color, font, space, radius, border, blur, shadow, motion, zIndex } as const;

/**
 * The CSS custom-property names components use. Kept as data so the token test
 * can assert that every declared token is actually emitted in tokens.css.
 */
export const CSS_VARS = {
  '--if-black': color.black,
  '--if-phosphor': color.phosphor,
  '--if-phosphor-dim': color.phosphorDim,
  '--if-phosphor-glow': color.phosphorGlow,
  '--if-glass': color.glass,
  '--if-glass-raised': color.glassRaised,
  '--if-glass-border': color.glassBorder,
  '--if-glass-border-strong': color.glassBorderStrong,
  '--if-text': color.text,
  '--if-text-muted': color.textMuted,
  '--if-text-faint': color.textFaint,
  '--if-long': color.long,
  '--if-short': color.short,
  '--if-warn': color.warn,
  '--if-info': color.info,
  '--if-font-display': font.display,
  '--if-font-body': font.body,
  '--if-font-mono': font.mono,
  '--if-radius-md': radius.md,
  '--if-radius-lg': radius.lg,
  '--if-blur-glass': blur.glass,
  '--if-shadow-glow': shadow.glow,
  '--if-shadow-panel': shadow.panel,
  '--if-motion-base': motion.base,
} as const;
