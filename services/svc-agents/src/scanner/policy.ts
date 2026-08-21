/**
 * agents.scanner product policy — D26-P0-11 signal inputs law honesty.
 *
 * Production default is unpublished (refuse-closed). Live tickers remain Class X.
 */
import {
  P0_11_BOARD_ID,
  PRODUCTION_SCANNER_SIGNAL_INPUTS_LAW,
  SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL,
  SEALED_ABS_CHANGE_X_LOG_VOLUME_LAW,
} from './signal-inputs-law.js';

export type ScannerPolicySummary = ReturnType<typeof describeScannerPolicy>;

/** Static policy surface for agents.scanner (D26-P1-A3). */
export function describeScannerPolicy() {
  return {
    boardId: P0_11_BOARD_ID,
    productionDefaultPublished: PRODUCTION_SCANNER_SIGNAL_INPUTS_LAW.published,
    sealedRecipeId: SEALED_ABS_CHANGE_X_LOG_VOLUME_LAW.rankingRecipeId,
    residual: SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL,
    inventsRankings: false as const,
    inventsLiveTickers: false as const,
    liveTickersClassX: true as const,
    fixtureRankOnlyWithoutLivePlane: true as const,
  };
}
