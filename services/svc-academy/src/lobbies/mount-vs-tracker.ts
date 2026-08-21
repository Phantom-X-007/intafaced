/**
 * D26-P1-LB1 — academy.lobbies mount vs tracker honest gaps.
 *
 * decideSeat capacity tiers + NullStreamProvider refuse — never fabricate SFU creds.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOBBIES_TRACKER_ID = 'academy.lobbies' as const;

export const LOBBIES_PRODUCT_SYMBOLS = ['decideSeat', 'NullStreamProvider', 'lobbyHostRights'] as const;

export const LOBBIES_DONE_BAR_TEST_FILES = [
  'access/room-access.test.ts',
  'stream/provider.test.ts',
  'host-rights.test.ts',
  'lobbies/mount-vs-tracker.test.ts',
] as const;

export const LOBBIES_HONEST_GAPS = ['gap.livekit_sfu_socket', 'gap.navigable_spatial_shell'] as const;

export function lobbiesSymbolsInSource(): readonly (typeof LOBBIES_PRODUCT_SYMBOLS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const access = readFileSync(join(here, '..', 'access', 'room-access.ts'), 'utf8');
  const stream = readFileSync(join(here, '..', 'stream', 'provider.ts'), 'utf8');
  const host = readFileSync(join(here, '..', 'host-rights.ts'), 'utf8');
  const blob = [access, stream, host].join('\n');
  return LOBBIES_PRODUCT_SYMBOLS.filter((name) => new RegExp(`\\b${name}\\b`).test(blob));
}

export function lobbiesHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const access = readFileSync(join(here, '..', 'access', 'room-access.ts'), 'utf8');
  const stream = readFileSync(join(here, '..', 'stream', 'provider.ts'), 'utf8');
  return (
    /export function decideSeat/.test(access) &&
    /academy\.room_full/.test(access) &&
    /REFUSES rather than returning a plausible token/.test(stream) &&
    /class NullStreamProvider/.test(stream)
  );
}

export function lobbiesDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return LOBBIES_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, '..', file)));
}

export function academyLobbiesTrackerBackendDoneBarMet(): boolean {
  return lobbiesSymbolsInSource().length === LOBBIES_PRODUCT_SYMBOLS.length && lobbiesHonestInSource() && lobbiesDoneBarTestsPresent();
}

export function academyLobbiesMountVsTrackerBoardCard(): {
  readonly tracker: typeof LOBBIES_TRACKER_ID;
  readonly symbols: number;
  readonly symbolsPresent: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const present = lobbiesSymbolsInSource();
  return {
    tracker: LOBBIES_TRACKER_ID,
    symbols: LOBBIES_PRODUCT_SYMBOLS.length,
    symbolsPresent: present.length,
    gaps: LOBBIES_HONEST_GAPS.length,
    backendDoneBarMet: academyLobbiesTrackerBackendDoneBarMet(),
  };
}
