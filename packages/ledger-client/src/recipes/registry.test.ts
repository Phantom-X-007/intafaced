import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { recipes, type RecipeName } from './index.js';

/**
 * THE RECIPE REGISTRY IS THE PRODUCT SURFACE.
 *
 * RECIPES.md is the human matrix. This test is the machine one: if a recipe is
 * added or removed without updating the documented count, the suite fails and
 * someone has to name the change. The number is not magic — it is the length of
 * `export const recipes` on tip (53 after businessApproval* + marketPurchase).
 * Bump it with intent.
 *
 * After market commerce landed, the matrix still said 49 and omitted
 * `marketPurchase` while the registry required 50 — honesty residual closed
 * here: count + named row must match registry keys. #1643 added three
 * business-approval recipes and bumped the registry length to 53 without the
 * header — D26-P2-11 closes that count lie (and the live-path inventory).
 */
describe('recipes registry', () => {
  it('exports every named recipe and nothing unnamed', () => {
    const names = Object.keys(recipes) as RecipeName[];
    expect(names.length).toBe(53);
    expect(names).toContain('marketPurchase');
    expect(names).toContain('businessApprovalHold');
    // Every key is a callable pure function.
    for (const name of names) {
      expect(typeof recipes[name]).toBe('function');
    }
  });

  it('RECIPES.md matrix names every registry key (count + rows)', () => {
    const mdPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'RECIPES.md');
    const md = readFileSync(mdPath, 'utf8');
    const countMatch = md.match(/\*\*(\d+) pure recipes\.\*\*/);
    expect(countMatch?.[1], 'RECIPES.md must state the pure-recipe count').toBe('53');

    const rowNames = [...md.matchAll(/^\| `([a-zA-Z][a-zA-Z0-9]*)`\s*\|/gm)].map((m) => m[1]!);
    const registry = Object.keys(recipes).sort();
    expect(rowNames.sort()).toEqual(registry);
  });
});
