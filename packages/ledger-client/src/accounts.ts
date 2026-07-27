import type { AccountRef } from './types.js';

/**
 * Well-known account constructors.
 *
 * Recipes never spell out an `AccountRef` inline. Every account in the OS is
 * named here, once, so "where does the fee go" has exactly one answer and
 * `grep` finds every module that touches a given pot.
 */

export function userAvailable(userId: string, assetId: string): AccountRef {
  return { ownerType: 'user', ownerId: userId, assetId, kind: 'available' };
}

export function userHold(userId: string, assetId: string): AccountRef {
  return { ownerType: 'user', ownerId: userId, assetId, kind: 'hold' };
}

export function userEscrow(userId: string, assetId: string): AccountRef {
  return { ownerType: 'user', ownerId: userId, assetId, kind: 'escrow' };
}

export function userStake(userId: string, assetId: string): AccountRef {
  return { ownerType: 'user', ownerId: userId, assetId, kind: 'stake' };
}

export function userCollateral(userId: string, assetId: string): AccountRef {
  return { ownerType: 'user', ownerId: userId, assetId, kind: 'collateral' };
}

export function subAccountAvailable(subAccountId: string, assetId: string): AccountRef {
  return { ownerType: 'subaccount', ownerId: subAccountId, assetId, kind: 'available' };
}

export function subAccountHold(subAccountId: string, assetId: string): AccountRef {
  return { ownerType: 'subaccount', ownerId: subAccountId, assetId, kind: 'hold' };
}

/** Where a module's fee revenue lands. Staking yield is distributed from here (§4.3). */
export function houseFees(module: string, assetId: string): AccountRef {
  return { ownerType: 'house', ownerId: `fees:${module}`, assetId, kind: 'available' };
}

/** Futures insurance fund backstop (§5.2). */
export function insuranceFund(assetId: string): AccountRef {
  return { ownerType: 'house', ownerId: 'insurance-fund', assetId, kind: 'available' };
}

/** Rewards engine — the pot real-yield and cashback are paid from. */
export function rewardsEngine(assetId: string): AccountRef {
  return { ownerType: 'house', ownerId: 'rewards-engine', assetId, kind: 'available' };
}

/** Burn address. Tokens debited here leave circulating supply, permanently. */
export function burnAccount(assetId: string): AccountRef {
  return { ownerType: 'house', ownerId: 'burn', assetId, kind: 'available' };
}

/** Internal market-maker account that seeds books at launch (§5.2). */
export function marketMaker(assetId: string): AccountRef {
  return { ownerType: 'house', ownerId: 'market-maker', assetId, kind: 'available' };
}

/** A module's own working account (e.g. p2p dispute pool). */
export function moduleAccount(module: string, purpose: string, assetId: string): AccountRef {
  return { ownerType: 'module', ownerId: `${module}:${purpose}`, assetId, kind: 'available' };
}

/**
 * The yield reserve behind one svc-bank earn pool (§8.1).
 *
 * Interest is paid OUT of this account, which means a pool can only ever pay
 * what has actually been funded into it. The alternative — accruing interest as
 * a number in svc-bank and settling later — is a promise with no asset behind
 * it, and the ledger has no way to tell you it has been over-promised.
 *
 * A pool's outstanding yield capacity is therefore `balance(earnPoolReserve(…))`
 * and nothing else. It is a query, not an investigation.
 */
export function earnPoolReserve(poolId: string, assetId: string): AccountRef {
  return moduleAccount('bank', `earn:${poolId}`, assetId);
}

/**
 * THE BOUNDARY.
 *
 * `treasury` accounts are the seam between the book and the outside world: an
 * external rail, a chain, or the token mint. They are the only accounts allowed
 * to run negative, and a negative balance here is exactly the platform's
 * obligation to the outside — the number reconciliation checks against custody.
 */
export function railBoundary(rail: string, assetId: string): AccountRef {
  return { ownerType: 'treasury', ownerId: `rail:${rail}`, assetId, kind: 'available' };
}

/** Token mint boundary — svc-token is the only minter (§4.3). */
export function mintBoundary(assetId: string): AccountRef {
  return { ownerType: 'treasury', ownerId: 'mint', assetId, kind: 'available' };
}

/** Bridge boundary — Fiat Plane ↔ Protocol Plane (§17.5 svc-bridge). */
export function bridgeBoundary(chain: string, assetId: string): AccountRef {
  return { ownerType: 'treasury', ownerId: `bridge:${chain}`, assetId, kind: 'available' };
}

/**
 * External venue boundary — assets held at a third-party venue after a routed
 * fill (docs/TERMINAL.md §4).
 *
 * A negative balance here is exactly our custodial exposure at that venue.
 * Keeping it as its own boundary account means "how much of our users' value is
 * sitting somewhere we do not control" is a query, not an investigation.
 */
export function venueBoundary(venue: string, assetId: string): AccountRef {
  return { ownerType: 'treasury', ownerId: `venue:${venue}`, assetId, kind: 'available' };
}
