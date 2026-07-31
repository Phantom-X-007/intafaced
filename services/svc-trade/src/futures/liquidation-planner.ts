/**
 * Isolated liquidation planner (trade.futures residual).
 *
 * PURE: given one open position + external mark price, decides whether to
 * liquidate and builds ledger recipe inputs. Does NOT invent marks, does NOT
 * post, does NOT run a cron. Job/cron supplies marks + posts recipes.
 *
 * Isolated v1: full close when equity <= maintenance threshold (default 50% of
 * initial margin) or when equity is non-positive. Loss draws margin first,
 * then insurance; residual margin (if any) is released to the user.
 */
import { formatAmount, parseAmount, recipes, type Amount, type PostRequest } from '@intafaced/ledger-client';

const SCALE = 10n ** 18n;

export interface LiquidationPosition {
  positionId: string;
  userId: string;
  side: 'long' | 'short';
  size: Amount;
  entryPrice: Amount;
  /** Locked margin still on the position collateral pot. */
  margin: Amount;
  marginAsset: string;
  /** Optional stored liq price — if set, also liquidates when mark crosses it. */
  liqPrice?: Amount | null;
}

export interface LiquidationPlanInput {
  /** Unique id for this liquidation attempt (idempotency root). */
  liquidationId: string;
  position: LiquidationPosition;
  /** External mark — decimal string. Never invent. */
  markPrice: string;
  /**
   * Liquidate when equity <= this fraction of initial margin (bps).
   * Default 5000 = 50%. Set 0 to only liquidate when equity <= 0.
   */
  maintenanceBps?: number;
}

export interface LiquidationPlan {
  liquidate: true;
  equity: Amount;
  unrealizedPnl: Amount;
  loss: Amount;
  fromMargin: Amount;
  fromInsurance: Amount;
  residualRelease: Amount;
  recipes: PostRequest[];
  reason: string;
}

export type LiquidationDecision = LiquidationPlan | { liquidate: false; equity: Amount; unrealizedPnl: Amount; reason: string };

/** Quote notional: size * price / SCALE. */
export function notionalAt(size: Amount, price: Amount): Amount {
  return (size * price) / SCALE;
}

/**
 * Unrealized PnL in quote: long (mark-entry)*size/SCALE; short (entry-mark)*size/SCALE.
 */
export function unrealizedPnl(side: 'long' | 'short', size: Amount, entry: Amount, mark: Amount): Amount {
  const diff = side === 'long' ? mark - entry : entry - mark;
  return (size * diff) / SCALE;
}

export function planLiquidation(input: LiquidationPlanInput): LiquidationDecision {
  const mark = parseAmount(input.markPrice);
  if (mark <= 0n) {
    return { liquidate: false, equity: 0n, unrealizedPnl: 0n, reason: 'invalid_mark' };
  }

  const { position } = input;
  if (position.size <= 0n || position.margin <= 0n) {
    return { liquidate: false, equity: 0n, unrealizedPnl: 0n, reason: 'empty_position' };
  }

  const uPnL = unrealizedPnl(position.side, position.size, position.entryPrice, mark);
  const equity = position.margin + uPnL;

  const maintBps = input.maintenanceBps ?? 5000;
  if (maintBps < 0 || maintBps > 10_000) {
    return { liquidate: false, equity, unrealizedPnl: uPnL, reason: 'invalid_maintenance_bps' };
  }
  const maintenance = (position.margin * BigInt(maintBps)) / 10_000n;

  let should = equity <= 0n || equity <= maintenance;
  let reason = equity <= 0n ? 'equity_non_positive' : 'below_maintenance';

  if (position.liqPrice != null && position.liqPrice > 0n) {
    const crossed = position.side === 'long' ? mark <= position.liqPrice : mark >= position.liqPrice;
    if (crossed) {
      should = true;
      reason = 'mark_crossed_liq_price';
    }
  }

  if (!should) {
    return { liquidate: false, equity, unrealizedPnl: uPnL, reason: 'healthy' };
  }

  const loss = uPnL < 0n ? -uPnL : 0n;
  const fromMargin = loss >= position.margin ? position.margin : loss;
  const fromInsurance = loss > position.margin ? loss - position.margin : 0n;
  const residualRelease = position.margin - fromMargin;

  const posts: PostRequest[] = [];
  if (fromMargin > 0n || fromInsurance > 0n) {
    posts.push(
      recipes.futuresRealizeLoss({
        positionId: position.positionId,
        userId: position.userId,
        assetId: position.marginAsset,
        fromMargin,
        fromInsurance,
        lossId: `${input.liquidationId}:loss`,
      }),
    );
  }
  if (residualRelease > 0n) {
    posts.push(
      recipes.futuresMarginRelease({
        positionId: position.positionId,
        userId: position.userId,
        assetId: position.marginAsset,
        amount: residualRelease,
        sequence: 1,
      }),
    );
  }

  return {
    liquidate: true,
    equity,
    unrealizedPnl: uPnL,
    loss,
    fromMargin,
    fromInsurance,
    residualRelease,
    recipes: posts,
    reason,
  };
}

export function summarizeLiquidation(d: LiquidationDecision): string {
  if (!d.liquidate) return `skip equity=${formatAmount(d.equity)} (${d.reason})`;
  return `liquidate loss=${formatAmount(d.loss)} margin=${formatAmount(d.fromMargin)} insurance=${formatAmount(d.fromInsurance)} release=${formatAmount(d.residualRelease)} (${d.reason})`;
}
