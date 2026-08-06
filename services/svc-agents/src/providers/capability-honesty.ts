/**
 * Agents L3 — pure provider capability catalog honesty (structural only).
 *
 * Mirrors provider.ts ProviderCapability: complete | stream | embed.
 * Does not invent vendor names or billing rates.
 */

export const PROVIDER_CAPABILITIES = ['complete', 'stream', 'embed'] as const;
export type ProviderCapabilityId = (typeof PROVIDER_CAPABILITIES)[number];

/** L3 — catalog board. */
export function providerCapabilityCatalogBoardCard(): {
  readonly capabilities: number;
  readonly hasComplete: number;
  readonly hasStream: number;
  readonly hasEmbed: number;
} {
  return {
    capabilities: PROVIDER_CAPABILITIES.length,
    hasComplete: PROVIDER_CAPABILITIES.includes('complete') ? 1 : 0,
    hasStream: PROVIDER_CAPABILITIES.includes('stream') ? 1 : 0,
    hasEmbed: PROVIDER_CAPABILITIES.includes('embed') ? 1 : 0,
  };
}

/** L3 — status line. */
export function providerCapabilityCatalogStatusLine(): string {
  const c = providerCapabilityCatalogBoardCard();
  return `capabilities=${c.capabilities} complete=${c.hasComplete} stream=${c.hasStream} embed=${c.hasEmbed}`;
}

/** L3 — parse status. */
export function parseProviderCapabilityCatalogStatusLine(line: string): {
  readonly capabilities: number;
  readonly complete: number;
  readonly stream: number;
  readonly embed: number;
} | null {
  const m = line.trim().match(/^capabilities=(\d+) complete=([01]) stream=([01]) embed=([01])$/);
  if (!m) return null;
  return {
    capabilities: Number(m[1]),
    complete: Number(m[2]),
    stream: Number(m[3]),
    embed: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function providerCapabilityCatalogStatusLineMatches(): boolean {
  const p = parseProviderCapabilityCatalogStatusLine(providerCapabilityCatalogStatusLine());
  if (!p) return false;
  const c = providerCapabilityCatalogBoardCard();
  return p.capabilities === c.capabilities && p.complete === c.hasComplete && p.stream === c.hasStream && p.embed === c.hasEmbed;
}

/** L3 — three capabilities. */
export function providerCapabilityCatalogStatusLineConsistent(line: string): boolean {
  const p = parseProviderCapabilityCatalogStatusLine(line);
  if (!p) return false;
  return p.capabilities === 3 && p.complete === 1 && p.stream === 1 && p.embed === 1;
}

/** L3 — export header. */
export function providerCapabilityCatalogExportHeader(): string {
  return 'capability';
}

/** L3 — export lines. */
export function providerCapabilityCatalogExportLines(): readonly string[] {
  return [...PROVIDER_CAPABILITIES];
}

/** L3 — full export. */
export function providerCapabilityCatalogExportText(): string {
  return [providerCapabilityCatalogExportHeader(), ...providerCapabilityCatalogExportLines()].join('\n');
}

/** L3 — capability declared. */
export function isDeclaredProviderCapability(cap: string): boolean {
  return (PROVIDER_CAPABILITIES as readonly string[]).includes(cap);
}
