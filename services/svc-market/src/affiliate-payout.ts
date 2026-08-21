/**
 * Market purchase → identity affiliate payout (producer caller).
 *
 * Accrue already claimed durable rows. This port pays them through
 * identity `POST /internal/affiliates/payout` with `{ feeEventId }` only.
 * Identity plans/posts via ledger-client. Market never invents rates or amounts.
 *
 * MUST NOT fail the purchase: 412 (unset / unpublished / frozen / nothing
 * accrued) and identity-down are swallowed. Never unwind the ledger post.
 */

import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import type { AffiliateMarketFeeLeg } from './affiliate-accrue.js';

export const AFFILIATE_PRODUCER_PAYOUT_PATH = '/internal/affiliates/payout';

export interface AffiliatePayoutPort {
  payoutMarketFee(feeEventId: string): Promise<void>;
}

export class NoopAffiliatePayout implements AffiliatePayoutPort {
  async payoutMarketFee(): Promise<void> {
    /* tests / stacks without IDENTITY_URL */
  }
}

/** Awaited after accrue; never throws (purchase already posted). */
export async function fireAffiliatePayout(port: AffiliatePayoutPort, legs: readonly AffiliateMarketFeeLeg[]): Promise<void> {
  for (const leg of legs) {
    try {
      await port.payoutMarketFee(leg.feeEventId);
    } catch {
      /* identity down / 5xx / timeout — do not unwind marketPurchase */
    }
  }
}

const FETCH_MS = 2_000;

export function createAffiliatePayoutClient(baseUrl: string, internalSecret: string): AffiliatePayoutPort {
  const url = `${baseUrl.replace(/\/$/, '')}${AFFILIATE_PRODUCER_PAYOUT_PATH}`;

  return {
    async payoutMarketFee(feeEventId) {
      const body = JSON.stringify({ feeEventId });
      const headers = {
        'content-type': 'application/json',
        ...serviceAuthHeadersForBody('svc-market', internalSecret, body),
      };
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(FETCH_MS),
      });
      if (response.ok) return;
      if (response.status === 412) return;
      throw new Error(`affiliate payout refused (${response.status})`);
    },
  };
}
