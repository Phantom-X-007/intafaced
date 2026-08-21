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
import { acceptAlertMark, outOfAppRequiredRefusal } from './accepted-mark.js';
import { evaluatePortfolioAlert, evaluatePriceAlert, evaluateUnpublishedKind as unpublishedKindOutcome } from './evaluate.js';
import type { AlertStore } from './store.js';
import {
  AlertKindUnpublishedError,
  AlertPortfolioUnpublishedError,
  type AlertEvalOutcome,
  type AlertRefuseCode,
  type CreatePortfolioAlertInput,
  type CreatePriceAlertInput,
  type CreateUnpublishedAlertInput,
  type MarkQuote,
  type MarkSource,
  type PriceAlert,
  type UnpublishedAlertKind,
} from './types.js';

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
  readonly code: Extract<AlertRefuseCode, 'alert.price_unavailable' | 'channel.not_configured' | 'channel.disabled'> | null;
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

/** Public-door evaluate — one watch, named refuse, never a fake last. */
export type EvaluateAlertReport = {
  readonly alert: PriceAlert | null;
  readonly outcome: AlertEvalOutcome;
  readonly evaluation: AlertEvaluationStatus;
  readonly notificationId: string | null;
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

  /**
   * Portfolio watches are refuse-closed. Nothing is stored, no balance is read,
   * and silence is not a fire. Callers must not invent a second book here.
   */
  createPortfolio(_input: CreatePortfolioAlertInput): never {
    throw new AlertPortfolioUnpublishedError();
  }

  /**
   * Unpublished kinds never become an active watch. No store write, no fire.
   */
  createUnpublishedKind(input: CreateUnpublishedAlertInput): never {
    throw new AlertKindUnpublishedError(input.kind);
  }

  /**
   * Same refuse as create — evaluate never fires a portfolio watch and never
   * carries a money field. The sweep does not call this; there is no stored row.
   */
  evaluatePortfolio(): AlertEvalOutcome {
    return evaluatePortfolioAlert();
  }

  /**
   * Same refuse as create — no invented funding/whale/liq/intel series.
   */
  evaluateUnpublishedKind(kind: UnpublishedAlertKind): AlertEvalOutcome {
    return unpublishedKindOutcome(kind);
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
    if (this.marks.kind !== 'live') {
      return {
        markSource: 'dark',
        canFire: false,
        code: 'alert.price_unavailable',
      };
    }
    const ooa = this.namedOutOfAppRefusal();
    if (ooa) {
      return {
        markSource: 'live',
        canFire: false,
        code: ooa.code,
      };
    }
    return { markSource: 'live', canFire: true, code: null };
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
   *
   * FIRE ORDER — notify first, then mark the watch fired.
   *
   * The previous order (`markFired` then `fireNotification`) permanently burned
   * a watch when the create path wrote nothing: fan-out kill returns
   * `{ inserted: false, notification: null }` without throwing, and a crash
   * after mark-before-insert left `status: 'fired'` with an empty inbox. Either
   * way the one-shot never retried. That is the same kill-lie the bus path
   * already refuses (`fanout-off-pin`): a kill must write nothing, not invent a
   * finished delivery.
   *
   * Notify first. `sourceIdempotencyKey` is `<alertId>:<markPrice>`, so a
   * redelivery after insert-before-mark reuses the same inbox row (and the
   * delivery claim stops a second channel send). Only when create produced or
   * recovered a row do we retire the watch. Fan-out off leaves the watch active
   * for a later pass.
   */
  async evaluateMarket(marketId: string, at: Date = new Date()): Promise<EvaluateMarketReport> {
    const quote = await this.sourcedQuote(marketId, at);
    const actives = await this.store.listActiveByMarket(marketId);
    const results: EvaluateMarketReport['results'][number][] = [];

    for (const alert of actives) {
      const applied = await this.applyEvaluation(alert, quote, at);
      results.push({
        alertId: alert.id,
        userId: alert.userId,
        outcome: applied.outcome,
        notificationId: applied.notificationId,
      });
    }

    return {
      marketId,
      mark: quote.kind === 'ok' ? quote.price : null,
      results,
    };
  }

  /**
   * Public evaluate door. Dark / missing marks refuse by name and never mark
   * the watch fired — even when the port quotes a last (invented live).
   */
  async evaluateAlert(userId: string, alertId: string, at: Date = new Date()): Promise<EvaluateAlertReport> {
    const evaluation = this.evaluationStatus();
    const alert = await this.store.get(userId, alertId);
    if (!alert) {
      return {
        alert: null,
        outcome: { kind: 'refuse', code: 'alert.not_active', detail: 'alert.not_found' },
        evaluation,
        notificationId: null,
      };
    }
    const quote = await this.sourcedQuote(alert.marketId, at);
    const applied = await this.applyEvaluation(alert, quote, at);
    const refreshed = (await this.store.get(userId, alertId)) ?? alert;
    return {
      alert: refreshed,
      outcome: applied.outcome,
      evaluation,
      notificationId: applied.notificationId,
    };
  }

  private async sourcedQuote(marketId: string, at: Date): Promise<MarkQuote> {
    const raw = await this.marks.quote(marketId, at);
    return acceptAlertMark(this.marks, raw, at);
  }

  private async applyEvaluation(
    alert: PriceAlert,
    quote: MarkQuote,
    at: Date,
  ): Promise<{ outcome: AlertEvalOutcome; notificationId: string | null }> {
    const ooa = this.namedOutOfAppRefusal();
    let outcome = evaluatePriceAlert(alert, quote);
    if (outcome.kind === 'fire' && ooa) {
      outcome = { kind: 'refuse', code: ooa.code, detail: ooa.detail };
    }
    let notificationId: string | null = null;

    if (outcome.kind === 'fire') {
      const created = await this.fireNotification(alert, outcome.markPrice);
      const reachedInbox = created.notification !== null || created.dispatch !== null;
      if (reachedInbox) {
        await this.store.markFired(alert.userId, alert.id, at);
        notificationId = created.notification?.id ?? null;
      }
    }

    return { outcome, notificationId };
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

  /** Inbox-only NotifyService stubs may omit channelStatus — that means nothing OOA was required. */
  private namedOutOfAppRefusal() {
    const status = typeof this.notify.channelStatus === 'function' ? this.notify.channelStatus() : [];
    return outOfAppRequiredRefusal(status);
  }
}
