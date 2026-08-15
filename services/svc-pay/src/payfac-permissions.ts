import {
  DEFAULT_GRANTED_AREAS,
  PERMISSION_AREAS,
  SubMerchantError,
  type PermissionArea,
  type PermissionChangeInput,
  type PermissionEventRecord,
  type PermissionGrantRecord,
} from './submerchants.js';
import type { MerchantAreaFence } from './merchant-ownership.js';

/**
 * D26-P1-P2 — PayFac sub-merchant permissions product path.
 *
 * Trees + journal + `assertMerchantAreaAccess` already exist on tip. This module
 * is the **product map** those surfaces share: which gateway/REST procedure needs
 * which area, which areas move value, and which PayFac residuals are honest §13
 * (not inventable here).
 *
 * Path-disjoint from open pay PRs that own `router.ts` / `index.ts` / plugins —
 * callers import this; wiring stays in `public-rest.ts` and tests.
 */

/** Areas that move value or control money-out. Never in DEFAULT_GRANTED_AREAS. */
export const MONEY_PERMISSION_AREAS = [
  'payment',
  'payment.refund',
  'settlement',
  'settlement.payout',
] as const satisfies readonly PermissionArea[];

export type MoneyPermissionArea = (typeof MONEY_PERMISSION_AREAS)[number];

/**
 * Gateway / public REST surface → required area.
 *
 * Kept here so REST and future routers cannot drift to a second vocabulary.
 * tRPC `router.ts` already inlines the same strings; do not dual-edit that file
 * while #1718 is open — this map is the seal for the REST half + honesty pins.
 */
export const PAYFAC_SURFACE_AREAS = {
  'rest.payments.read': 'payment',
  'rest.payments.list': 'payment',
  'rest.payments.create': 'payment',
  'rest.payments.authorize': 'payment',
  'rest.payments.capture': 'payment',
  'rest.payments.refund': 'payment.refund',
  'rest.payment-links.create': 'payment.link',
  'rest.payment-links.list': 'payment.link',
  'rest.payment-links.deactivate': 'payment.link',
  'rest.balances.read': 'merchant.profile',
  'rest.webhooks.write': 'webhook',
  'rest.webhooks.read': 'webhook',
  'rest.permissions.grant': 'permission',
  'rest.permissions.revoke': 'permission',
  'rest.permissions.list': 'permission',
  'rest.permissions.history': 'permission',
  // Vocabulary list (`GET .../areas`) is pay:read only — no subject merchant.
} as const satisfies Record<string, PermissionArea>;

export type PayfacSurface = keyof typeof PAYFAC_SURFACE_AREAS;

/**
 * Honest partial — buildable mechanics stop here until owner/commercial law.
 * Named so `pay.payfac` cannot be read as "full PayFac underwriting".
 */
export const PAYFAC_PERMISSION_SOCKETS = [
  {
    id: 'socket.payfac-settling-party-partner',
    residual:
      'settlingParty values other than "self" — settling a sub-merchant out of our account is acquiring (sponsor bank / BIN). Tracked as socket.psp-partners; code refuses non-self by name.',
  },
  {
    id: 'socket.payfac-split-fee-recipes',
    residual:
      'Platform fee vs sub-merchant proceeds ledger recipes — DIRECTION §8 / owner fee table. No invent splits; settleWindow already refuses missing feeBps rather than assuming zero.',
  },
] as const;

/** Narrow port REST uses when the boot path passes SubMerchantService as `trees`. */
export interface PayfacPermissionPort extends MerchantAreaFence {
  grantPermission(input: PermissionChangeInput): Promise<PermissionEventRecord>;
  revokePermission(input: PermissionChangeInput): Promise<PermissionEventRecord>;
  listPermissions(actorMerchantId: string, subjectMerchantId: string): Promise<PermissionGrantRecord[]>;
  permissionHistory(actorMerchantId: string, subjectMerchantId: string, limit?: number): Promise<PermissionEventRecord[]>;
}

export function isPayfacPermissionPort(value: unknown): value is PayfacPermissionPort {
  if (!value || typeof value !== 'object') return false;
  const v = value as PayfacPermissionPort;
  return (
    typeof v.assertHolds === 'function' &&
    typeof v.grantPermission === 'function' &&
    typeof v.revokePermission === 'function' &&
    typeof v.listPermissions === 'function' &&
    typeof v.permissionHistory === 'function'
  );
}

export function areaForSurface(surface: PayfacSurface): PermissionArea {
  return PAYFAC_SURFACE_AREAS[surface];
}

/** Every vocabulary area is either money-gated, visibility/default, or named elsewhere. */
export function permissionAreaCoverage(): {
  areas: readonly PermissionArea[];
  money: readonly MoneyPermissionArea[];
  defaults: readonly PermissionArea[];
  sockets: typeof PAYFAC_PERMISSION_SOCKETS;
} {
  return {
    areas: PERMISSION_AREAS,
    money: MONEY_PERMISSION_AREAS,
    defaults: DEFAULT_GRANTED_AREAS,
    sockets: PAYFAC_PERMISSION_SOCKETS,
  };
}

/**
 * Resolve the caller's merchant node from the principal. Never from the body —
 * same rule as `submerchant-router.ts` `actor()`.
 */
export async function resolveActorMerchantId(
  pay: { getMerchantByUserId(userId: string): Promise<{ id: string } | null> },
  principalUserId: string | undefined,
): Promise<string> {
  if (!principalUserId) {
    throw new SubMerchantError(
      'This account is not a merchant, so it holds no position in any sub-merchant tree.',
      'pay.submerchant_not_onboarded',
    );
  }
  const actor = await pay.getMerchantByUserId(principalUserId);
  if (!actor) {
    throw new SubMerchantError(
      'This account is not a merchant, so it holds no position in any sub-merchant tree.',
      'pay.submerchant_not_onboarded',
    );
  }
  return actor.id;
}
