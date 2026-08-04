/**
 * Shared path collision helpers for swarm.mjs + claim-check.mjs.
 * One algorithm — two call sites must not disagree about who owns a path.
 */
export const touches = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

export function filesCollide(filesA, filesB) {
  for (const a of filesA || []) {
    for (const b of filesB || []) {
      if (touches(a, b)) return true;
    }
  }
  return false;
}
