/** Owner integer env (bps). Blank / unset / non-integer → null. Never invent 0. */
export function parseOwnerIntegerEnv(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}
