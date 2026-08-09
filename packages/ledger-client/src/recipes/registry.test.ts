import { describe, expect, it } from 'vitest';
import { recipes, type RecipeName } from './index.js';

/**
 * THE RECIPE REGISTRY IS THE PRODUCT SURFACE.
 *
 * RECIPES.md is the human matrix. This test is the machine one: if a recipe is
 * added or removed without updating the documented count, the suite fails and
 * someone has to name the change. The number is not magic — it is the length of
 * `export const recipes` on tip when this file landed (49). Bump it with intent.
 */
describe('recipes registry', () => {
  it('exports every named recipe and nothing unnamed', () => {
    const names = Object.keys(recipes) as RecipeName[];
    expect(names.length).toBe(49);
    // Every key is a callable pure function.
    for (const name of names) {
      expect(typeof recipes[name]).toBe('function');
    }
  });
});
