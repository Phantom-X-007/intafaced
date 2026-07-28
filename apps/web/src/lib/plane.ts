import { MODULES, type Plane } from '@intafaced/config/modules';

/**
 * THE TWO PLANES (§22 · Doctrine §16.8).
 *
 * "Zero-KYC follows custody. Everywhere. Without exception."
 *
 *   · **Fiat Plane — the CEX.** The platform holds the asset. `svc-trade` posts
 *     holds and fills to `svc-ledger`; the balance is ours to move. Therefore
 *     login, therefore a verification tier, therefore the jurisdiction matrix.
 *   · **Protocol Plane — the DEX.** The platform holds nothing. `svc-protocol`
 *     has no signing key, the accounts are EIP-1167 clones the user owns, and
 *     there is no `protocol:write` scope for any token to carry. Therefore no
 *     KYC — §503: "no-KYC exists on the Protocol Plane because there is nothing
 *     to KYC."
 *
 * ── Why `custodial` is READ, not written ───────────────────────────────────
 *
 * `MODULES` is the registry `checkAccess` gates on and `pnpm scan:custody`
 * asserts against. If this file declared its own booleans, the badge in the UI
 * and the rule in the services could drift, and the direction it would drift is
 * always the same one: a custodial surface still wearing the sovereign badge.
 * Reading the same table makes that impossible — a change to custody in the
 * registry changes what the user is told, in the same commit.
 */

export type PlaneId = Plane;

export interface PlaneDefinition {
  readonly id: PlaneId;
  /** What a trader calls it. */
  readonly venue: 'CEX' | 'DEX';
  readonly title: string;
  /** True when the platform can take custody of user assets on this plane. */
  readonly custodial: boolean;
  /** One sentence. It is the product claim, so it is not decoration. */
  readonly custodyStatement: string;
  /** What it takes to trade here. */
  readonly access: string;
  readonly moduleId: 'trade' | 'protocol';
}

export const FIAT_PLANE: PlaneDefinition = {
  id: 'fiat',
  venue: 'CEX',
  title: 'Fiat Plane',
  custodial: MODULES.trade.custodial,
  custodyStatement: 'INTAFACED holds these funds. Balances live in svc-ledger and the platform can move them.',
  access: 'Sign in · verification tier basic · jurisdiction matrix',
  moduleId: 'trade',
};

export const PROTOCOL_PLANE: PlaneDefinition = {
  id: 'protocol',
  venue: 'DEX',
  title: 'Protocol Plane',
  custodial: MODULES.protocol.custodial,
  custodyStatement: 'You hold these funds. INTAFACED holds no key that can move them, and there is nothing here to verify.',
  access: 'A wallet. No sign-in, no verification, no account.',
  moduleId: 'protocol',
};

export const PLANES: readonly PlaneDefinition[] = [PROTOCOL_PLANE, FIAT_PLANE];

export function planeById(id: PlaneId): PlaneDefinition {
  return id === 'protocol' ? PROTOCOL_PLANE : FIAT_PLANE;
}
