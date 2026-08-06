/**
 * Contracts L3 — pure blueprint tone-register catalog honesty.
 *
 * Mirrors blueprint.ts toneRegister: direct | warm | socratic | terse.
 * Does not invent guardrail product law.
 */

export const TONE_REGISTERS = ['direct', 'warm', 'socratic', 'terse'] as const;
export type ToneRegisterId = (typeof TONE_REGISTERS)[number];

/** L3 — catalog board. */
export function toneRegisterCatalogBoardCard(): {
  readonly registers: number;
  readonly hasDirect: number;
  readonly hasWarm: number;
  readonly hasSocratic: number;
  readonly hasTerse: number;
} {
  return {
    registers: TONE_REGISTERS.length,
    hasDirect: TONE_REGISTERS.includes('direct') ? 1 : 0,
    hasWarm: TONE_REGISTERS.includes('warm') ? 1 : 0,
    hasSocratic: TONE_REGISTERS.includes('socratic') ? 1 : 0,
    hasTerse: TONE_REGISTERS.includes('terse') ? 1 : 0,
  };
}

/** L3 — status line. */
export function toneRegisterCatalogStatusLine(): string {
  const c = toneRegisterCatalogBoardCard();
  return `registers=${c.registers} direct=${c.hasDirect} warm=${c.hasWarm} socratic=${c.hasSocratic} terse=${c.hasTerse}`;
}

/** L3 — parse status. */
export function parseToneRegisterCatalogStatusLine(line: string): {
  readonly registers: number;
  readonly direct: number;
  readonly warm: number;
  readonly socratic: number;
  readonly terse: number;
} | null {
  const m = line.trim().match(/^registers=(\d+) direct=([01]) warm=([01]) socratic=([01]) terse=([01])$/);
  if (!m) return null;
  return {
    registers: Number(m[1]),
    direct: Number(m[2]),
    warm: Number(m[3]),
    socratic: Number(m[4]),
    terse: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function toneRegisterCatalogStatusLineMatches(): boolean {
  const p = parseToneRegisterCatalogStatusLine(toneRegisterCatalogStatusLine());
  if (!p) return false;
  const c = toneRegisterCatalogBoardCard();
  return (
    p.registers === c.registers &&
    p.direct === c.hasDirect &&
    p.warm === c.hasWarm &&
    p.socratic === c.hasSocratic &&
    p.terse === c.hasTerse
  );
}

/** L3 — four registers. */
export function toneRegisterCatalogStatusLineConsistent(line: string): boolean {
  const p = parseToneRegisterCatalogStatusLine(line);
  if (!p) return false;
  return p.registers === 4 && p.direct === 1 && p.warm === 1 && p.socratic === 1 && p.terse === 1;
}

/** L3 — export header. */
export function toneRegisterCatalogExportHeader(): string {
  return 'register';
}

/** L3 — export lines. */
export function toneRegisterCatalogExportLines(): readonly string[] {
  return [...TONE_REGISTERS];
}

/** L3 — full export. */
export function toneRegisterCatalogExportText(): string {
  return [toneRegisterCatalogExportHeader(), ...toneRegisterCatalogExportLines()].join('\n');
}

/** L3 — register declared. */
export function isDeclaredToneRegister(reg: string): boolean {
  return (TONE_REGISTERS as readonly string[]).includes(reg);
}
