import { BankError } from '../errors.js';

/**
 * FIAT RAMP VIA PAY ADAPTERS (D26-P1-B4) — mediation port, not a second book.
 *
 * Tracker title: "Fiat on/off ramp reusing svc-pay adapters".
 * ADR split: fiat remains `socket.psp-partners` commercially; the *code path*
 * that will host a partner rail is svc-pay's `RailAdapter` plane — never a
 * bank-local PSP client, never an invented APY/BIN, never a second money book.
 *
 * svc-bank deliberately does **not** import `@intafaced/svc-pay`. Boot (or a
 * future contracts edge) may inject a port that asks pay's registry. Silence /
 * empty list = honest refuse. A `live` rail with the matching capability is the
 * only shape that may proceed to ledger-client deposit/withdraw recipes.
 *
 * Sandbox pay rails succeed on the pay side and must NOT launder into a bank
 * fiat ramp — that would invent a PSP. Today's registered pay offramp rail
 * (`bank-payout`) is `absent` and therefore refuses here the same as empty.
 */

export type PayFiatRampCapability = 'onramp' | 'offramp';

/** Same three-mode vocabulary as svc-pay `RailMode` — names only, no import. */
export type PayFiatRailMode = 'live' | 'sandbox' | 'absent';

export interface PayFiatRailSnapshot {
  readonly railId: string;
  readonly mode: PayFiatRailMode;
  readonly capabilities: readonly PayFiatRampCapability[];
}

/**
 * Narrow port. Implementations live at the process edge (boot wiring) or in
 * tests. Production default is {@link emptyPayFiatRampPort}.
 */
export interface PayFiatRampPort {
  listFiatRails(): readonly PayFiatRailSnapshot[] | Promise<readonly PayFiatRailSnapshot[]>;
}

/** Always-empty port — boot default until pay registry is wired across the edge. */
export const emptyPayFiatRampPort: PayFiatRampPort = {
  listFiatRails: () => [],
};

/**
 * Pick a usable live pay rail for the capability. Sandbox and absent never win.
 */
export function selectLivePayFiatRail(
  rails: readonly PayFiatRailSnapshot[],
  capability: PayFiatRampCapability,
): PayFiatRailSnapshot | null {
  for (const rail of rails) {
    if (rail.mode !== 'live') continue;
    if (!rail.capabilities.includes(capability)) continue;
    if (!rail.railId.trim()) continue;
    return rail;
  }
  return null;
}

/**
 * Resolve the pay-adapter rail id for a fiat ramp leg, or refuse by socket name.
 *
 * Refusal text always names: (1) `socket.psp-partners`, (2) that the path is
 * svc-pay RailAdapter, (3) why the considered rails did not qualify.
 */
export async function resolvePayFiatRailId(port: PayFiatRampPort | null | undefined, capability: PayFiatRampCapability): Promise<string> {
  const rails = port ? await Promise.resolve(port.listFiatRails()) : [];
  const live = selectLivePayFiatRail(rails, capability);
  if (live) return live.railId;

  const summary =
    rails.length === 0
      ? 'no pay fiat rails registered (empty PayFiatRampPort / unset edge wire)'
      : rails.map((r) => `${r.railId}:${r.mode}[${r.capabilities.join('|') || '∅'}]`).join(', ');

  throw new BankError(
    `Fiat ${capability} is socket.psp-partners — a bank/PSP partner and money-transmission permission, not inventable code. ` +
      `The only in-repo path is a live svc-pay RailAdapter (PayFiatRampPort); sandbox/absent rails cannot host bank fiat. ` +
      `Considered: ${summary}.`,
    'bank.fiat_ramp_socket',
  );
}
