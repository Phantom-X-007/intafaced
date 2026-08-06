/**
 * Contracts L3 — pure blueprint card-renderer error catalog honesty.
 *
 * Mirrors blueprint.ts card renderer error codes.
 * Does not invent render vendor / money law.
 */

export const CARD_RENDERER_ERROR_CODES = [
  'blueprint.card_renderer_unconfigured',
  'blueprint.card_renderer_unreachable',
  'blueprint.card_renderer_protocol',
] as const;
export type CardRendererErrorCodeId = (typeof CARD_RENDERER_ERROR_CODES)[number];

/** L3 — catalog board. */
export function cardRendererErrorCatalogBoardCard(): {
  readonly codes: number;
  readonly hasUnconfigured: number;
  readonly hasUnreachable: number;
  readonly hasProtocol: number;
} {
  return {
    codes: CARD_RENDERER_ERROR_CODES.length,
    hasUnconfigured: CARD_RENDERER_ERROR_CODES.includes('blueprint.card_renderer_unconfigured') ? 1 : 0,
    hasUnreachable: CARD_RENDERER_ERROR_CODES.includes('blueprint.card_renderer_unreachable') ? 1 : 0,
    hasProtocol: CARD_RENDERER_ERROR_CODES.includes('blueprint.card_renderer_protocol') ? 1 : 0,
  };
}

/** L3 — status line. */
export function cardRendererErrorCatalogStatusLine(): string {
  const c = cardRendererErrorCatalogBoardCard();
  return `codes=${c.codes} unconfigured=${c.hasUnconfigured} unreachable=${c.hasUnreachable} protocol=${c.hasProtocol}`;
}

/** L3 — parse status. */
export function parseCardRendererErrorCatalogStatusLine(line: string): {
  readonly codes: number;
  readonly unconfigured: number;
  readonly unreachable: number;
  readonly protocol: number;
} | null {
  const m = line.trim().match(/^codes=(\d+) unconfigured=([01]) unreachable=([01]) protocol=([01])$/);
  if (!m) return null;
  return {
    codes: Number(m[1]),
    unconfigured: Number(m[2]),
    unreachable: Number(m[3]),
    protocol: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function cardRendererErrorCatalogStatusLineMatches(): boolean {
  const p = parseCardRendererErrorCatalogStatusLine(cardRendererErrorCatalogStatusLine());
  if (!p) return false;
  const c = cardRendererErrorCatalogBoardCard();
  return p.codes === c.codes && p.unconfigured === c.hasUnconfigured && p.unreachable === c.hasUnreachable && p.protocol === c.hasProtocol;
}

/** L3 — three codes. */
export function cardRendererErrorCatalogStatusLineConsistent(line: string): boolean {
  const p = parseCardRendererErrorCatalogStatusLine(line);
  if (!p) return false;
  return p.codes === 3 && p.unconfigured === 1 && p.unreachable === 1 && p.protocol === 1;
}

/** L3 — export header. */
export function cardRendererErrorCatalogExportHeader(): string {
  return 'code';
}

/** L3 — export lines. */
export function cardRendererErrorCatalogExportLines(): readonly string[] {
  return [...CARD_RENDERER_ERROR_CODES];
}

/** L3 — full export. */
export function cardRendererErrorCatalogExportText(): string {
  return [cardRendererErrorCatalogExportHeader(), ...cardRendererErrorCatalogExportLines()].join('\n');
}

/** L3 — code declared. */
export function isDeclaredCardRendererErrorCode(code: string): boolean {
  return (CARD_RENDERER_ERROR_CODES as readonly string[]).includes(code);
}
