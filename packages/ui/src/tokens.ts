/**
 * DESIGN TOKENS — the brand (§3 Phase 0 deliverable).
 *
 * Deep navy with a gold accent. These values are the brand; components read
 * them and nothing hard-codes a hex outside this file. A colour that is not
 * here does not exist in the product.
 *
 * The CSS custom properties in tokens.css are generated from these same values
 * — see tokens.test.ts, which fails if the two ever drift apart.
 *
 * ── Why this replaced the phosphor-green terminal palette ───────────────────
 *
 * The previous scheme was pure black with a CRT green accent. It reads as a
 * hacker aesthetic, and a platform asking people to deposit money should not
 * look like a prop. This palette is derived from the reference exchange UI in
 * `vendor/` (see docs/adr/2026-07-28-bizzan-ui.md) because it is the visual
 * language people already associate with a real trading venue: a dark navy
 * surface that lets green and red carry meaning, and a single warm accent that
 * does not compete with them.
 *
 * MODERNISED, not copied. The reference stops at flat hexes; this adds the
 * elevation ramp, the alpha-based borders, and the contrast levels a current
 * interface needs — the source's `#828ea1` body text on `#192330` sits at 4.1:1
 * and fails WCAG AA, so `textMuted` here is lifted to pass.
 */

export const color = {
  /**
   * Surface ramp. Not one flat background — depth comes from stacked navies
   * rather than from borders, which is what stops a dense trading screen
   * reading as a spreadsheet.
   */
  base: '#0F1620',
  surface: '#192330',
  surfaceRaised: '#27313E',
  surfaceOverlay: '#313B48',

  /**
   * Gold. The single accent: primary actions, active nav, focus rings.
   *
   * Deliberately NOT used for market direction. An accent that also means
   * "up" leaves you no colour for "this is the button" on a red day.
   */
  accent: '#F0A70A',
  accentBright: '#F0AC19',
  accentDim: '#B87D06',
  accentGlow: 'rgba(240, 167, 10, 0.28)',

  /** Secondary — links, informational chips, chart axes. */
  azure: '#3BB3E4',
  azureDim: '#049DDC',

  /** Borders as alpha over the surface, so they hold on every ramp step. */
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.16)',
  borderAccent: 'rgba(240, 167, 10, 0.45)',

  text: '#F5F7FA',
  /** Lifted from the reference's #828EA1, which fails AA on this surface. */
  textMuted: '#A6B2C4',
  textFaint: 'rgba(245, 247, 250, 0.42)',
  /** For use ON the gold accent, where white would smear. */
  textOnAccent: '#1A1200',

  /**
   * Market semantics. These two are load-bearing: they are the only way a
   * trader reads direction at a glance, so nothing else in the palette may
   * claim them.
   */
  long: '#00B275',
  longDim: '#00875A',
  short: '#FF4A68',
  shortDim: '#D93A54',

  warn: '#F0A70A',
  danger: '#FF4A68',
  info: '#3BB3E4',
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
  hairline: `1px solid ${color.border}`,
  strong: `1px solid ${color.borderStrong}`,
  accent: `1px solid ${color.borderAccent}`,
} as const;

export const blur = {
  panel: 'blur(12px)',
  heavy: 'blur(24px)',
} as const;

export const shadow = {
  /** Accent bloom — focus and live states only, never decoration. */
  glow: `0 0 12px ${color.accentGlow}`,
  glowStrong: `0 0 24px ${color.accentGlow}`,
  /** Elevation. Two steps only: a panel is raised or it is not. */
  panel: '0 4px 16px rgba(0, 0, 0, 0.4)',
  modal: '0 16px 48px rgba(0, 0, 0, 0.6)',
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
  '--if-base': color.base,
  '--if-surface': color.surface,
  '--if-surface-raised': color.surfaceRaised,
  '--if-surface-overlay': color.surfaceOverlay,
  '--if-accent': color.accent,
  '--if-accent-bright': color.accentBright,
  '--if-accent-dim': color.accentDim,
  '--if-accent-glow': color.accentGlow,
  '--if-azure': color.azure,
  '--if-azure-dim': color.azureDim,
  '--if-border': color.border,
  '--if-border-strong': color.borderStrong,
  '--if-border-accent': color.borderAccent,
  '--if-text': color.text,
  '--if-text-muted': color.textMuted,
  '--if-text-faint': color.textFaint,
  '--if-text-on-accent': color.textOnAccent,
  '--if-long': color.long,
  '--if-long-dim': color.longDim,
  '--if-short': color.short,
  '--if-short-dim': color.shortDim,
  '--if-warn': color.warn,
  '--if-danger': color.danger,
  '--if-info': color.info,
  '--if-font-display': font.display,
  '--if-font-body': font.body,
  '--if-font-mono': font.mono,
  '--if-radius-md': radius.md,
  '--if-radius-lg': radius.lg,
  '--if-blur-panel': blur.panel,
  '--if-shadow-glow': shadow.glow,
  '--if-shadow-panel': shadow.panel,
  '--if-shadow-modal': shadow.modal,
  '--if-motion-base': motion.base,
} as const;
