/**
 * execution.arbitrage product policy — external-only scan honesty (§28 / D26-P1-X4).
 *
 * Consolidates the public posture from `arbitrage.ts`. Rides execution.sor cost
 * model only — no second ranking rule, no default spread/mid, no bridge fantasy.
 */
import { ARB_LEGS_ATOMIC } from './arb-legs.js';
import {
  CROSS_EXCHANGE_DEFAULT_MID,
  CROSS_EXCHANGE_DEFAULT_SPREAD_BPS,
  HOUSE_ARB_PREFERENCE_BPS,
  type ArbRefuseReason,
} from './arbitrage.js';

export const ARB_BRIDGE_FANTASY_REFUSE_REASON = 'bridge_fantasy' as const satisfies ArbRefuseReason;

export type ArbitragePolicySummary = ReturnType<typeof describeArbitragePolicy>;

/** Public honesty board for execution.arbitrage external-only scanner. */
export function describeArbitragePolicy() {
  return {
    externalOnlyV1: true as const,
    ridesSorCostModelOnly: true as const,
    crossExchangeDefaultSpreadBps: CROSS_EXCHANGE_DEFAULT_SPREAD_BPS,
    crossExchangeDefaultMid: CROSS_EXCHANGE_DEFAULT_MID,
    houseArbPreferenceBps: HOUSE_ARB_PREFERENCE_BPS,
    noHouseArbPreference: HOUSE_ARB_PREFERENCE_BPS === null,
    noDefaultSpreadBps: CROSS_EXCHANGE_DEFAULT_SPREAD_BPS === null,
    noDefaultMid: CROSS_EXCHANGE_DEFAULT_MID === null,
    bridgeFantasyRefuseReason: ARB_BRIDGE_FANTASY_REFUSE_REASON,
    bridgeFantasyRefused: true as const,
    inventoryPrePositionRequired: true as const,
    internalVenueRefused: true as const,
    missingQuoteRefused: true as const,
    nonPositiveMidRefused: true as const,
    staleQuoteRefused: true as const,
    inventsSpreads: false as const,
    inventsFees: false as const,
    inventsMids: false as const,
    noSecondMoneyBook: true as const,
    legsAtomic: ARB_LEGS_ATOMIC,
    failedLegIsNotGroupSuccess: true as const,
    unknownLegIsNotGroupSuccess: true as const,
    venueOutageIsNotSuccess: true as const,
    timeoutIsNotSuccess: true as const,
    missingFillReportDoesNotInventFill: true as const,
    duplicateRecoveryDoesNotDoubleFill: true as const,
  };
}
