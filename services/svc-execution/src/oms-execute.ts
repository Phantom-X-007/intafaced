/**
 * OMS execute door — plan with existing SOR, then submit the winning legs.
 *
 * Does not invent a second ranker. Plan refuses (internal / kill / invalid)
 * return unchanged and never call submit. Submit throw/reject is `submit_failed`,
 * never a fabricated filled report. Plan path still throws
 * `execution.oms_plan_does_not_submit`.
 */
import { parseAmount } from '@intafaced/ledger-client';
import type { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import type { ExecutionReport, LiquiditySource, VenueExecution } from '@intafaced/venue-adapter';
import { planOmsRoute, type OmsPlanInput, type OmsPlanRefuse, type OmsPlanVenue } from './oms-plan.js';

export type OmsSubmitFn = LiquiditySource['submit'];

export type OmsExecuteVenue = OmsPlanVenue & {
  readonly submit?: OmsSubmitFn;
};

export type OmsExecuteInput = Omit<OmsPlanInput, 'venues'> & {
  readonly venues: readonly OmsExecuteVenue[];
  readonly submitByVenue?: Readonly<Record<string, OmsSubmitFn>>;
};

export type OmsExecuteOk = {
  readonly ok: true;
  readonly report: ExecutionReport;
  readonly executions: readonly VenueExecution[];
};

export type OmsExecuteRefuse = OmsPlanRefuse | { readonly ok: false; readonly reason: 'submit_failed'; readonly detail: string };

export type OmsExecuteResult = OmsExecuteOk | OmsExecuteRefuse;

function submitFor(venue: OmsExecuteVenue, map: OmsExecuteInput['submitByVenue']): OmsSubmitFn | undefined {
  return venue.submit ?? map?.[venue.id];
}

function submitErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function executeOmsRoute(input: OmsExecuteInput, registry?: SealedHouseTenantRegistry): Promise<OmsExecuteResult> {
  const planned = await planOmsRoute(input, registry);
  if (!planned.ok) return planned;

  const executions: VenueExecution[] = [];
  for (const leg of planned.report.venues) {
    const venue = input.venues.find((v) => v.id === leg.venueId);
    const submit = venue ? submitFor(venue, input.submitByVenue) : input.submitByVenue?.[leg.venueId];
    if (!submit) {
      return {
        ok: false,
        reason: 'submit_failed',
        detail: `no submit injected for venue ${leg.venueId}`,
      };
    }

    let execution: VenueExecution;
    try {
      execution = await submit({
        symbol: planned.report.symbol,
        side: planned.report.side,
        amount: parseAmount(leg.amount),
        limitPrice: parseAmount(leg.price),
        clientOrderId: `oms-${leg.venueId}`,
      });
    } catch (err) {
      return { ok: false, reason: 'submit_failed', detail: submitErrorMessage(err) };
    }

    if (execution.status === 'rejected') {
      return {
        ok: false,
        reason: 'submit_failed',
        detail: `venue ${leg.venueId} rejected ${execution.venueOrderId}`,
      };
    }

    executions.push(execution);
  }

  return { ok: true, report: planned.report, executions };
}
