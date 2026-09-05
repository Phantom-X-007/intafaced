import type { Sql } from 'postgres';
import { ServiceAuthError, verifyServiceHeaders } from '@intafaced/contracts';
import { planPplns, type PplnsInput, type PplnsPlan, type PplnsShare } from './pplns.js';
import { persistWindowShares, PG_UNAVAILABLE } from './window-store.js';

export const MINING_UNAUTHENTICATED = 'mining.unauthenticated' as const;

export type MiningShareAuthRefuse = {
  readonly ok: false;
  readonly status: 401;
  readonly body: {
    readonly accepted: false;
    readonly error: 'service credentials required';
    readonly code: typeof MINING_UNAUTHENTICATED;
    readonly rejected: string;
  };
};

function unauthenticated(rejected: string): MiningShareAuthRefuse {
  return {
    ok: false,
    status: 401,
    body: {
      accepted: false,
      error: 'service credentials required',
      code: MINING_UNAUTHENTICATED,
      rejected,
    },
  };
}

/**
 * POST /submitShare persists shares the epoch job later pays.
 * Edge mounts `/api/mining` — unsigned was a public payout ingest.
 * Same HMAC helper as ledger/token/matching. Blank secret is a typed refuse.
 */
export function authorizeSubmitShare(
  headers: Record<string, string | string[] | undefined>,
  secret: string | undefined,
  rawBody: Buffer,
): { readonly ok: true; readonly service: string } | MiningShareAuthRefuse {
  const trimmed = secret?.trim() ?? '';
  if (trimmed.length < 32) return unauthenticated('unset');
  try {
    const { service, rejected } = verifyServiceHeaders(headers, trimmed, {
      rawBody: { retained: true, bytes: rawBody },
      mode: 'require',
    });
    if (service === null) return unauthenticated(rejected ?? 'unauthenticated');
    return { ok: true, service };
  } catch (err) {
    if (err instanceof ServiceAuthError) return unauthenticated('unset');
    throw err;
  }
}

export async function handleSubmitSharePost(input: {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly rawBody: Buffer;
  readonly secret: string | undefined;
  readonly sql: Sql | null;
}): Promise<{ readonly status: number; readonly body: unknown }> {
  const auth = authorizeSubmitShare(input.headers, input.secret, input.rawBody);
  if (!auth.ok) return { status: auth.status, body: auth.body };
  try {
    if (!input.sql) throw new Error(PG_UNAVAILABLE);
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.rawBody.toString('utf8')) as unknown;
    } catch {
      throw new Error('mining.share_malformed');
    }
    const pplns = parsePplnsBody(parsed);
    if (pplns.shares.length === 0) throw new Error('shares_empty');
    const plan = await submitShare(input.sql, pplns);
    return {
      status: 200,
      body: { accepted: true, settled: false, epoch: plan.windowId, payouts: plan.payouts, net: plan.net },
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : 'mining.submitShare_failed';
    return { status: 409, body: { accepted: false, error: code } };
  }
}

export function parsePplnsBody(raw: unknown): PplnsInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('mining.share_malformed');
  const v = raw as Record<string, unknown>;
  if (typeof v.windowId !== 'string' || !v.windowId) throw new Error('window_unconfigured');
  if (typeof v.assetId !== 'string' || !v.assetId) throw new Error('window_unconfigured');
  if (typeof v.reward === 'number') throw new Error('mining.amount_not_decimal');
  if (typeof v.reward !== 'string') throw new Error('reward_unconfigured');
  if (typeof v.feeBps !== 'number' || !Number.isInteger(v.feeBps)) throw new Error('fee_unconfigured');
  let epoch: number | undefined;
  if (v.epoch !== undefined && v.epoch !== null) {
    if (typeof v.epoch !== 'number' || !Number.isInteger(v.epoch) || v.epoch < 0) throw new Error('mining.epoch_unset');
    epoch = v.epoch;
  }
  if (!Array.isArray(v.shares)) throw new Error('shares_empty');
  const shares: PplnsShare[] = v.shares.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('mining.share_malformed');
    const sh = item as Record<string, unknown>;
    if (typeof sh.shareId !== 'string' || typeof sh.minerId !== 'string') throw new Error('mining.share_malformed');
    if (typeof sh.weight === 'number') throw new Error('mining.weight_not_integer');
    if (typeof sh.weight === 'bigint') return { shareId: sh.shareId, minerId: sh.minerId, weight: sh.weight };
    if (typeof sh.weight === 'string' && /^(0|[1-9]\d*)$/.test(sh.weight)) {
      return { shareId: sh.shareId, minerId: sh.minerId, weight: BigInt(sh.weight) };
    }
    throw new Error('mining.weight_not_integer');
  });
  return { windowId: v.windowId, epoch, assetId: v.assetId, reward: v.reward, feeBps: v.feeBps, shares };
}

/** Persist the share. Mint/rewardPay happens on the JobHost tick, not this door. */
export async function submitShare(sql: Sql, input: PplnsInput): Promise<PplnsPlan> {
  if (!sql) throw new Error(PG_UNAVAILABLE);
  const plan = planPplns(input);
  await persistWindowShares(sql, input);
  return plan;
}
