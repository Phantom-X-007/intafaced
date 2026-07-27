import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CSS_VARS, color, font, space, tokens } from './tokens.js';
import { directionOf } from './primitives.js';

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');

/** Normalise for comparison: CSS is written lowercase, TS uses uppercase hex. */
const normalise = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim();

describe('§3 design tokens are locked', () => {
  it('holds the brand to pure black and phosphor green', () => {
    expect(color.black).toBe('#000000');
    expect(color.phosphor).toBe('#00FF41');
  });

  it('specifies Orbitron for display and Inter for body', () => {
    expect(font.display).toContain('Orbitron');
    expect(font.body).toContain('Inter');
  });

  it('keeps glass borders on the phosphor at 15% — the spec value', () => {
    expect(color.glassBorder).toBe('rgba(0, 255, 65, 0.15)');
  });

  it('bases spacing on a 4px grid', () => {
    expect(space[1]).toBe('4px');
    expect(space[2]).toBe('8px');
    expect(space[4]).toBe('16px');
  });
});

describe('tokens.ts and tokens.css cannot drift', () => {
  it.each(Object.entries(CSS_VARS))('emits %s with the value from tokens.ts', (name, value) => {
    const declaration = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(css);
    expect(declaration, `${name} is missing from tokens.css`).not.toBeNull();
    expect(normalise(declaration![1]!)).toBe(normalise(value));
  });

  it('declares no hex colour that is not a token', () => {
    const hexes = new Set((css.match(/#[0-9a-fA-F]{3,8}/g) ?? []).map((h) => h.toLowerCase()));
    const allowed = new Set(
      Object.values(color)
        .filter((c) => c.startsWith('#'))
        .map((c) => c.toLowerCase()),
    );
    for (const hex of hexes) {
      expect(allowed.has(hex), `${hex} in tokens.css is not a declared token`).toBe(true);
    }
  });

  it('respects prefers-reduced-motion', () => {
    expect(css).toContain('prefers-reduced-motion');
  });
});

describe('primitives', () => {
  it('reads direction from a signed change', () => {
    expect(directionOf(1.5)).toBe('up');
    expect(directionOf('-0.2')).toBe('down');
    expect(directionOf(0)).toBe('flat');
    expect(directionOf('not a number')).toBe('flat');
  });
});

describe('token surface', () => {
  it('exposes one namespace so consumers never reach for a raw value', () => {
    expect(Object.keys(tokens).sort()).toEqual(['blur', 'border', 'color', 'font', 'motion', 'radius', 'shadow', 'space', 'zIndex'].sort());
  });
});
