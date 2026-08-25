import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import {
  createMatchingClient as createMatchingClientInner,
  MatchingUnavailableError,
  type EngineSubmitResult,
  type MatchingClient,
} from './matching-client.js';
import type { LifecycleAdmissionProof } from '../lifecycle-proof.js';

/**
 * Matching flatten door. Sibling of matching-client.ts so that file never moves.
 * POST /markets/:marketId/positions/close — svc-trade only, PLACE proof.
 * Trade does not invent qty, side, or a mark.
 */

export interface MatchingCloseRequest {
  readonly orderId: string;
  readonly accountId: string;
  readonly lifecycleProof: LifecycleAdmissionProof;
}

export type MatchingClientWithClose = MatchingClient & {
  closePosition(marketId: string, request: MatchingCloseRequest): Promise<EngineSubmitResult>;
};

export function hasClosePosition(matching: MatchingClient): matching is MatchingClientWithClose {
  return typeof (matching as MatchingClientWithClose).closePosition === 'function';
}

export async function closePositionOnMatching(
  matching: MatchingClient,
  marketId: string,
  request: MatchingCloseRequest,
): Promise<EngineSubmitResult> {
  if (hasClosePosition(matching)) {
    return matching.closePosition(marketId, request);
  }
  throw new MatchingUnavailableError('matching close-position door is not wired');
}

export async function postClosePosition(
  baseUrl: string,
  internalSecret: string,
  marketId: string,
  request: MatchingCloseRequest,
): Promise<EngineSubmitResult> {
  const url = baseUrl.replace(/\/$/, '');
  const path = `/markets/${encodeURIComponent(marketId)}/positions/close`;
  const payload = JSON.stringify(request);
  let response: Response;
  try {
    response = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...serviceAuthHeadersForBody('svc-trade', internalSecret, payload),
      },
      body: payload,
    });
  } catch (err) {
    throw new MatchingUnavailableError(`svc-matching ${path} is unreachable: ${(err as Error).message}`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new MatchingUnavailableError(`svc-matching ${path} failed (${response.status}): ${detail}`);
  }
  return (await response.json()) as EngineSubmitResult;
}

export function createMatchingClient(baseUrl: string, internalSecret: string): MatchingClientWithClose {
  const inner = createMatchingClientInner(baseUrl, internalSecret);
  return Object.assign(inner, {
    closePosition(marketId: string, request: MatchingCloseRequest) {
      return postClosePosition(baseUrl, internalSecret, marketId, request);
    },
  });
}
