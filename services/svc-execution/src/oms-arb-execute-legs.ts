/**
 * OMS external arb legs execute door (P-04).
 *
 * Parent clientOrderId links buy+sell child submits. Refuses when plan fails or
 * either venue is unwired. Partial leg success is reported honestly — not atomic.
 */
import { parseAmount } from '@intafaced/ledger-client';
import type { VenueExecution } from '@intafaced/venue-adapter';
import { planOmsArbAtomicLegs, type OmsArbPlanLegsInput, type OmsArbPlanLegsResult } from './oms-arb-plan-legs.js';
import type { EmsOrderStore } from './oms-ems-store.js';
import type { OmsSubmitFn } from './oms-trade-submit.js';

export type OmsArbExecuteLegsInput = OmsArbPlanLegsInput & {
  readonly parentClientOrderId: string;
  readonly buyLimitPrice: string;
  readonly sellLimitPrice: string;
};

export type OmsArbExecuteLegsOk = {
  readonly ok: true;
  readonly parentClientOrderId: string;
  readonly executions: readonly VenueExecution[];
};

export type OmsArbExecuteLegsSubmitFailed = {
  readonly ok: false;
  readonly reason: 'submit_failed';
  readonly detail: string;
  readonly partialExecutions?: readonly VenueExecution[];
};

export type OmsArbExecuteLegsResult = OmsArbPlanLegsResult | OmsArbExecuteLegsOk | OmsArbExecuteLegsSubmitFailed;

export async function executeOmsArbAtomicLegs(
  input: OmsArbExecuteLegsInput,
  submitByVenue: Readonly<Record<string, OmsSubmitFn>>,
  emsStore?: EmsOrderStore,
): Promise<OmsArbExecuteLegsResult> {
  const planned = planOmsArbAtomicLegs(input);
  if (!planned.ok) return planned;

  const executions: VenueExecution[] = [];
  const prices = { buy: input.buyLimitPrice, sell: input.sellLimitPrice } as const;

  for (const leg of planned.legs) {
    const submit = submitByVenue[leg.venueId];
    if (!submit) {
      return {
        ok: false,
        reason: 'submit_failed',
        detail: `venue ${leg.venueId} is not wired for submit`,
        ...(executions.length > 0 ? { partialExecutions: executions } : {}),
      };
    }

    const clientOrderId = `${input.parentClientOrderId}-${leg.side}`;
    let execution: VenueExecution;
    try {
      execution = await submit({
        symbol: leg.symbol,
        side: leg.side,
        amount: parseAmount(leg.amount),
        limitPrice: parseAmount(prices[leg.side]),
        clientOrderId,
      });
    } catch (err) {
      return {
        ok: false,
        reason: 'submit_failed',
        detail: err instanceof Error ? err.message : String(err),
        ...(executions.length > 0 ? { partialExecutions: executions } : {}),
      };
    }

    if (execution.status === 'rejected') {
      return {
        ok: false,
        reason: 'submit_failed',
        detail: `venue ${leg.venueId} rejected ${execution.venueOrderId}`,
        ...(executions.length > 0 ? { partialExecutions: executions } : {}),
      };
    }

    emsStore?.record({
      clientOrderId,
      venueId: leg.venueId,
      symbol: leg.symbol,
      side: leg.side,
      execution,
    });
    executions.push(execution);
  }

  return { ok: true, parentClientOrderId: input.parentClientOrderId, executions };
}
