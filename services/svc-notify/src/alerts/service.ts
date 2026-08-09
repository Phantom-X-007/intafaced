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
