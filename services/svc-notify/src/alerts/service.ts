/**
 * AlertService — watchlist CRUD + evaluate-and-fire into the existing fan-out.
 *
 * §31: "Rides §9 notification fan-out" — we call NotifyService.create, which
 * already owns inbox insert + channel dispatch. No second delivery path.
 *
 * Idempotency key is `<alertId>:<markPrice>` so a redelivery of the same cross
 * does not double-notify, and a later cross at a different mark is a new fact
 * only if the alert were re-activated (MVP: one-shot fire).
 */

import type { CreateResult, NotifyService } from '../notify-service.js';
import { evaluatePriceAlert } from './evaluate.js';
import type { AlertStore } from './store.js';
import type { AlertEvalOutcome, CreatePriceAlertInput, MarkSource, PriceAlert } from './types.js';

/**
 * How often the mounted sweep evaluates every market holding an active watch.
 *
 * A constant, not an environment variable, for the reason
 * `DEFAULT_POSITION_NOTIFY_POLICY` is a constant: whether a watch is evaluated
 * at all is not something a deployment should be able to differ on quietly. An
 * operator who wants alerts stopped has the fan-out kill-switch, which stops the
 * write rather than the read.
 */
export const ALERT_SWEEP_INTERVAL_MS = 60_000;

/**
 * What the deployment is able to say about whether a watch can fire.
 *
 * This is a USER-FACING answer, and it exists because of D-S-13: a watch the
 * platform cannot evaluate is a promise with no delivery, and the disclosure has
 * to be in code at the surface a user reads — not in a comment.
 */
export type AlertEvaluationStatus = {
  /** Wiring, not weather. See `MarkSource.kind`. */
  readonly markSource: 'dark' | 'live';
  /**
   * False when nothing this deployment holds can fire, whatever the price does.
   *
   * True is never a promise that a given cross WILL produce a message — delivery
   * is best-effort on every channel (§8) and a quote may still be unavailable at
   * the moment of the sweep. It only says the wiring is not missing.
   */
  readonly canFire: boolean;
  /** The refusal every evaluation would record right now, or null. */
  readonly code: 'alert.price_unavailable' | null;
};

/** One pass of the sweep, in the shape `/ready` reports and a test asserts. */
export type AlertSweepReport = {
  /** Markets that held at least one active watch this pass. */
  readonly markets: number;
  readonly fired: number;
  readonly held: number;
  readonly refused: number;
  /** Refusals counted by code, so "nothing fired" always says why. */
  readonly refusals: Readonly<Record<string, number>>;
};

export type EvaluateMarketReport = {
  readonly marketId: string;
  readonly mark: string | null;
  readonly results: readonly {
    readonly alertId: string;
    readonly userId: string;
    readonly outcome: AlertEvalOutcome;
    readonly notificationId: string | null;
  }[];
};

export class AlertService {
  constructor(
    private readonly store: AlertStore,
    private readonly marks: MarkSource,
    private readonly notify: NotifyService,
  ) {}

  create(input: CreatePriceAlertInput): Promise<PriceAlert> {
    return this.store.create(input);
  }

  list(userId: string): Promise<readonly PriceAlert[]> {
    return this.store.list(userId);
  }

  cancel(userId: string, id: string): Promise<PriceAlert | null> {
    return this.store.cancel(userId, id);
  }

  /**
   * Whether a watch this deployment holds can fire at all.
   *
   * Read by the router so the answer reaches the person who created the watch.
   */
  evaluationStatus(): AlertEvaluationStatus {
    const live = this.marks.kind === 'live';
    return {
      markSource: this.marks.kind,
      canFire: live,
      code: live ? null : 'alert.price_unavailable',
    };
  }

  /**
   * THE SWEEP — the thing that makes `evaluateMarket` a job path rather than a
   * method nobody calls.
   *
   * Until this existed, `router.ts` said evaluation "is an internal job path"
   * and no such path was mounted: `notify.createAlert` returned a watch with
   * `status: 'active'` and nothing anywhere would ever look at it again. That is
   * D-S-13 Class B exactly — a user holds a belief the missing wiring would have
   * to deliver — and it is the same shape as `bankMarginCalled`, whose consumer
   * was complete and parked while borrowers went untold.
   *
   * It sweeps from `activeMarkets()` rather than from a market list, so a watch
   * on a market nobody thought to enumerate is still evaluated.
   *
   * UNDER A DARK MARK SOURCE THIS WRITES NOTHING, and that is the correct
   * outcome rather than a disappointing one: `evaluatePriceAlert` refuses on an
   * unavailable quote, no alert is marked fired, and no inbox row is created. The
   * sweep's value while the source is dark is that it is REAL — the day an owner
   * injects a feed, watches fire, because the driver is already mounted and
   * proven rather than waiting to be discovered missing.
   */
  async evaluateDueAlerts(at: Date = new Date()): Promise<AlertSweepReport> {
    const markets = await this.store.activeMarkets();
    let fired = 0;
    let held = 0;
    let refused = 0;
    const refusals: Record<string, number> = {};

    for (const marketId of markets) {
      const report = await this.evaluateMarket(marketId, at);
      for (const result of report.results) {
        if (result.outcome.kind === 'fire') {
          fired += 1;
          continue;
        }
        if (result.outcome.kind === 'hold') {
          held += 1;
          continue;
        }
        refused += 1;
        refusals[result.outcome.code] = (refusals[result.outcome.code] ?? 0) + 1;
      }
    }

    return { markets: markets.length, fired, held, refused, refusals };
  }

  /**
   * Evaluate every active alert on a market against the injected mark source.
   * Dark / stale marks refuse every alert by name — nothing is invented.
   */
  async evaluateMarket(marketId: string, at: Date = new Date()): Promise<EvaluateMarketReport> {
    const quote = await this.marks.quote(marketId, at);
    const actives = await this.store.listActiveByMarket(marketId);
    const results: EvaluateMarketReport['results'][number][] = [];

    for (const alert of actives) {
      const outcome = evaluatePriceAlert(alert, quote);
      let notificationId: string | null = null;

      if (outcome.kind === 'fire') {
        const fired = await this.store.markFired(alert.userId, alert.id, at);
        if (fired) {
          const created = await this.fireNotification(fired, outcome.markPrice);
          notificationId = created.notification?.id ?? null;
        }
      }

      results.push({
        alertId: alert.id,
        userId: alert.userId,
        outcome,
        notificationId,
      });
    }

    return {
      marketId,
      mark: quote.kind === 'ok' ? quote.price : null,
      results,
    };
  }

  private async fireNotification(alert: PriceAlert, markPrice: string): Promise<CreateResult> {
    return this.notify.create({
      userId: alert.userId,
      kind: 'alert.price.crossed',
      titleKey: 'notify.alert.price.crossed.title',
      bodyKey: 'notify.alert.price.crossed.body',
      params: {
        alertId: alert.id,
        marketId: alert.marketId,
        direction: alert.direction,
        targetPrice: alert.targetPrice,
        markPrice,
      },
      href: `/markets/${alert.marketId}`,
      severity: 'action',
      sourceSubject: 'intafaced.notify.alert.price.crossed',
      sourceIdempotencyKey: `${alert.id}:${markPrice}`,
    });
  }
}
