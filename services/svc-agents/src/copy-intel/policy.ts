/**
 * Copy-Intel product policy door — money-write denylist + returns-board ban.
 *
 * No live leader plane, no stats build. Integrators read this before wiring UI.
 */
import { COPY_INTEL_MONEY_WRITE_TOOLS } from './guardrail.js';
import { copyIntelMoneyDenyBoardCard, copyIntelMoneyDenyExportText, copyIntelMoneyDenyStatusLine } from './money-deny-honesty.js';
import { FORBIDDEN_RETURNS_RANK_KEYS, RETURNS_RANKED_BOARD_REFUSE_REASON } from './returns-board-refuse.js';
import { MARKETING_BOARD_MODES, RETURNS_RANK_SORT_KEYS } from './directory.js';

export type CopyIntelPolicySummary = {
  readonly moneyWriteTools: readonly string[];
  readonly moneyDeny: ReturnType<typeof copyIntelMoneyDenyBoardCard>;
  readonly moneyDenyStatusLine: string;
  readonly moneyDenyExport: string;
  readonly returnsRankForbiddenKeys: readonly string[];
  readonly returnsRankSortKeys: readonly string[];
  readonly marketingBoardModes: readonly string[];
  readonly returnsRankedBoardRefuseReason: typeof RETURNS_RANKED_BOARD_REFUSE_REASON;
  readonly directorySortKey: 'leaderId';
  readonly rankedByReturns: false;
};

/** Static policy surface for copy-intel (D26-P1-A5 / guardrail law). */
export function describeCopyIntelPolicy(): CopyIntelPolicySummary {
  return {
    moneyWriteTools: COPY_INTEL_MONEY_WRITE_TOOLS,
    moneyDeny: copyIntelMoneyDenyBoardCard(),
    moneyDenyStatusLine: copyIntelMoneyDenyStatusLine(),
    moneyDenyExport: copyIntelMoneyDenyExportText(),
    returnsRankForbiddenKeys: FORBIDDEN_RETURNS_RANK_KEYS,
    returnsRankSortKeys: RETURNS_RANK_SORT_KEYS,
    marketingBoardModes: MARKETING_BOARD_MODES,
    returnsRankedBoardRefuseReason: RETURNS_RANKED_BOARD_REFUSE_REASON,
    directorySortKey: 'leaderId',
    rankedByReturns: false,
  };
}
