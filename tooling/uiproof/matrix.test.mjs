import assert from 'node:assert/strict';
import { LAYOUT_FAMILIES, PROOF_CASES, ROUTES, TIER_A_VIEWPORTS, TIER_B_ROUTES, TIER_B_VIEWPORTS } from './matrix.mjs';

assert.deepEqual(
  TIER_A_VIEWPORTS.map((viewport) => viewport.width),
  [1440, 390],
);
assert.deepEqual(
  TIER_B_VIEWPORTS.map((viewport) => viewport.width),
  [320, 768, 1024],
);
assert.equal(TIER_B_ROUTES.length, LAYOUT_FAMILIES.length);
assert.equal(PROOF_CASES.length, ROUTES.length * 2 + LAYOUT_FAMILIES.length * 3);
assert.equal(
  new Set(PROOF_CASES.map(({ route, viewport }) => `${route.id}@${viewport.name}`)).size,
  PROOF_CASES.length,
  'each proof cell must have a unique route and viewport identity',
);

console.log(`uiproof matrix: ${ROUTES.length * 2} Tier A + ${LAYOUT_FAMILIES.length * 3} Tier B cells`);
