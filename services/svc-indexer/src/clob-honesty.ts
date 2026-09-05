import { z } from 'zod';

/**
 * Q-index leftover — the venue ABI is a fixture, not a live CLOB.
 *
 * `abi.ts` / `DevVenue.sol` agree with each other. That is not an audited
 * production venue (SOCKET §13 `socket.clob-contracts`). This payload never
 * claims `live: true` and never invents pool reserves.
 */

export const INDEXER_CLOB_FIXTURE_NOT_LIVE = 'indexer.clob_fixture_not_live' as const;

/** Deterministic CREATE(addressIndex=5, nonce=0) for the disposable Anvil deploy. */
export const DEV_VENUE_ADDRESS = '0x0116686E2291dbd5e317F47faDBFb43B599786Ef';
export const ZERO_VENUE_ADDRESS = '0x0000000000000000000000000000000000000000';

export const clobHonestySchema = z.object({
  live: z.literal(false),
  kind: z.enum(['unset', 'fixture']),
  reserves: z.literal(false),
});

export type ClobHonesty = z.infer<typeof clobHonestySchema>;

export function clobHonesty(venue?: string | null): ClobHonesty {
  const v = (venue ?? '').trim().toLowerCase();
  if (!v || v === ZERO_VENUE_ADDRESS.toLowerCase()) {
    return { live: false, kind: 'unset', reserves: false };
  }
  return { live: false, kind: 'fixture', reserves: false };
}

/** Prod (or any door that claims a live CLOB) must not serve the fixture ABI as one. */
export function clobFixtureRefusesLiveClaim(opts: { readonly claimLiveClob: boolean; readonly venue?: string | null }): boolean {
  return opts.claimLiveClob && clobHonesty(opts.venue).kind === 'fixture';
}
