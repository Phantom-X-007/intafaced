/**
 * Agents L3 — pure provider capability catalog honesty (no upstream I/O).
 *
 * Mirrors provider.ts ProviderCapability + health shape. No vendor names.
 */

export const PROVIDER_CAPABILITIES = ['complete', 'stream', 'embed'] as const;
export type ProviderCapabilityId = (typeof PROVIDER_CAPABILITIES)[number];

export type ProviderHealthBoardInput = {
  readonly id: string;
  readonly healthy: boolean;
  readonly usable: boolean;
  readonly capabilities: readonly ProviderCapabilityId[];
};

/** L3 — capability catalog board. */
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

/** L3 — catalog status line. */
export function providerCapabilityCatalogStatusLine(): string {
  const c = providerCapabilityCatalogBoardCard();
  return `capabilities=${c.capabilities} complete=${c.hasComplete} stream=${c.hasStream} embed=${c.hasEmbed}`;
}

/** L3 — parse catalog. */
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

/** L3 — true when catalog matches. */
export function providerCapabilityCatalogStatusLineMatches(): boolean {
  const p = parseProviderCapabilityCatalogStatusLine(providerCapabilityCatalogStatusLine());
  if (!p) return false;
  const c = providerCapabilityCatalogBoardCard();
  return p.capabilities === c.capabilities && p.complete === c.hasComplete && p.stream === c.hasStream && p.embed === c.hasEmbed;
}

/** L3 — all three capabilities present. */
export function providerCapabilityCatalogStatusLineConsistent(line: string): boolean {
  const p = parseProviderCapabilityCatalogStatusLine(line);
  if (!p) return false;
  return p.capabilities === 3 && p.complete === 1 && p.stream === 1 && p.embed === 1;
}

/** L3 — provider list board. */
export function providerListBoardCard(providers: readonly ProviderHealthBoardInput[]): {
  readonly providers: number;
  readonly healthy: number;
  readonly usable: number;
  readonly withComplete: number;
} {
  return {
    providers: providers.length,
    healthy: providers.filter((p) => p.healthy).length,
    usable: providers.filter((p) => p.usable).length,
    withComplete: providers.filter((p) => p.capabilities.includes('complete')).length,
  };
}

/** L3 — list status line. */
export function providerListStatusLine(providers: readonly ProviderHealthBoardInput[]): string {
  const c = providerListBoardCard(providers);
  return `providers=${c.providers} healthy=${c.healthy} usable=${c.usable} with_complete=${c.withComplete}`;
}

/** L3 — parse list. */
export function parseProviderListStatusLine(line: string): {
  readonly providers: number;
  readonly healthy: number;
  readonly usable: number;
  readonly withComplete: number;
} | null {
  const m = line.trim().match(/^providers=(\d+) healthy=(\d+) usable=(\d+) with_complete=(\d+)$/);
  if (!m) return null;
  return {
    providers: Number(m[1]),
    healthy: Number(m[2]),
    usable: Number(m[3]),
    withComplete: Number(m[4]),
  };
}

/** L3 — true when list status matches. */
export function providerListStatusLineMatches(providers: readonly ProviderHealthBoardInput[]): boolean {
  const p = parseProviderListStatusLine(providerListStatusLine(providers));
  if (!p) return false;
  const c = providerListBoardCard(providers);
  return p.providers === c.providers && p.healthy === c.healthy && p.usable === c.usable && p.withComplete === c.withComplete;
}

/** L3 — healthy/usable/withComplete ≤ providers. */
export function providerListStatusLineConsistent(line: string): boolean {
  const p = parseProviderListStatusLine(line);
  if (!p) return false;
  return p.healthy <= p.providers && p.usable <= p.providers && p.withComplete <= p.providers;
}

/** L3 — export header. */
export function providerListExportHeader(): string {
  return 'providers,healthy,usable,with_complete';
}

/** L3 — export line. */
export function providerListExportLine(providers: readonly ProviderHealthBoardInput[]): string {
  const c = providerListBoardCard(providers);
  return `${c.providers},${c.healthy},${c.usable},${c.withComplete}`;
}

/** L3 — full export. */
export function providerListExportText(providers: readonly ProviderHealthBoardInput[]): string {
  return [providerListExportHeader(), providerListExportLine(providers)].join('\n');
}

/** L3 — capability declared. */
export function isDeclaredProviderCapability(cap: string): boolean {
  return (PROVIDER_CAPABILITIES as readonly string[]).includes(cap);
}

/** L3 — count in range. */
export function providerCountInRange(providers: readonly ProviderHealthBoardInput[], min: number, max: number): boolean {
  if (min > max) return false;
  const n = providers.length;
  return n >= min && n <= max;
}
