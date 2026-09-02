import { z } from 'zod';
import { adaptResultSchema, decimalString, matchingOrderCommandSchema, type AdaptResult, type MatchingOrderCommand } from './command.js';

/**
 * HTTP port: adapted NewOrderSingle → matching submit.
 * Not a book. Not a ledger. Does not invent last, account, TIF, or a fill.
 */

export const matchingPortErrorSchema = z.object({
  code: z.enum([
    'unsupported_begin_string',
    'unsupported_appl_ver',
    'unsupported_msg_type',
    'unsupported_tag',
    'unsupported_side',
    'unsupported_ord_type',
    'missing_cl_ord_id',
    'missing_qty',
    'missing_price',
    'invalid_decimal',
    'invalid_message',
    'matching_unconfigured',
    'matching_unavailable',
    'matching_timeout',
    'matching_rejected',
  ]),
  message: z.string().min(1),
});

export type MatchingPortError = z.infer<typeof matchingPortErrorSchema>;

const matchingFillAckSchema = z
  .object({
    price: decimalString,
    qty: decimalString,
  })
  .passthrough();

export const matchingSubmitAckSchema = z
  .object({
    accepted: z.literal(true),
    sequence: z.number().nullable().optional(),
    fills: z.array(matchingFillAckSchema).optional(),
    resting: z.unknown().optional(),
    rejected: z.null().optional(),
    cancellations: z.array(z.unknown()).optional(),
    triggered: z.array(z.unknown()).optional(),
  })
  .passthrough();

export type MatchingSubmitAck = z.infer<typeof matchingSubmitAckSchema>;

export type MatchingPortResult = { ok: true; ack: MatchingSubmitAck } | { ok: false; error: MatchingPortError };

export type MatchingPortOptions = {
  /** Blank / omitted with blank env → matching_unconfigured. Never localhost-by-default. */
  matchingBaseUrl?: string;
  timeoutMs?: number;
};

/** Matching submit JSON. Qty/price stay decimal strings. Price null on market — not last. */
export type MatchingSubmitBody = {
  clOrdId: string;
  type: 'market' | 'limit';
  side: 'buy' | 'sell';
  qty: string;
  price: string | null;
};

const DEFAULT_TIMEOUT_MS = 5_000;

function refuse(code: MatchingPortError['code'], message: string): { ok: false; error: MatchingPortError } {
  return { ok: false, error: { code, message } };
}

export function toMatchingSubmitBody(command: MatchingOrderCommand): MatchingSubmitBody {
  return {
    clOrdId: command.clOrdId,
    type: command.ordType,
    side: command.side,
    qty: command.qty,
    price: command.price,
  };
}

export function matchingSubmitPath(command: MatchingOrderCommand): string {
  return `/markets/${encodeURIComponent(command.symbol)}/orders`;
}

export function readMatchingBaseUrl(raw: string | undefined): { ok: true; url: string } | { ok: false; error: MatchingPortError } {
  const url = (raw ?? '').trim().replace(/\/$/, '');
  if (!url) {
    return {
      ok: false,
      error: {
        code: 'matching_unconfigured',
        message: 'MATCHING_BASE_URL is blank; svc-fix does not invent a matching host, a last price, or a fill',
      },
    };
  }
  return { ok: true, url };
}

function commandRefuse(command: unknown): { ok: true; command: MatchingOrderCommand } | { ok: false; error: MatchingPortError } {
  const parsed = matchingOrderCommandSchema.safeParse(command);
  if (parsed.success) {
    return { ok: true, command: parsed.data };
  }
  const begin = parsed.error.issues.some((issue) => issue.path[0] === 'beginString');
  if (begin) {
    return refuse('unsupported_begin_string', 'BeginString is not FIX.4.2, FIX.4.4, FIX.5.0, or FIXT.1.1');
  }
  return refuse('invalid_message', 'matching command is not a NewOrderSingle decimal-string command');
}

function classifyHttpStatus(status: number, detail: string): MatchingPortResult {
  if (status === 408 || status === 504) {
    return refuse('matching_timeout', `matching submit timed out (${status}); svc-fix does not invent a fill`);
  }
  if (status >= 500) {
    return refuse(
      'matching_unavailable',
      `matching submit failed (${status})${detail ? `: ${detail}` : ''}; svc-fix does not invent a fill`,
    );
  }
  return refuse('matching_rejected', `matching rejected submit (${status})${detail ? `: ${detail}` : ''}; svc-fix does not invent a fill`);
}

function parseAck(body: unknown): MatchingPortResult {
  const acceptedFalse = z
    .object({
      accepted: z.literal(false),
      rejected: z
        .object({
          code: z.string().optional(),
          message: z.string().optional(),
        })
        .passthrough()
        .nullable()
        .optional(),
    })
    .passthrough()
    .safeParse(body);
  if (acceptedFalse.success) {
    const rejected = acceptedFalse.data.rejected;
    const message =
      rejected && typeof rejected.message === 'string' && rejected.message.length > 0
        ? rejected.message
        : 'matching rejected the order; svc-fix does not invent a fill';
    return refuse('matching_rejected', message);
  }
  const ack = matchingSubmitAckSchema.safeParse(body);
  if (!ack.success) {
    return refuse('matching_rejected', 'matching submit ack is not decimal-string JSON; svc-fix does not invent a fill');
  }
  return { ok: true, ack: ack.data };
}

function isAbort(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const name = 'name' in err ? String(err.name) : '';
  return name === 'AbortError' || name === 'TimeoutError';
}

/**
 * POST adapted command to matching `POST /markets/:marketId/orders`.
 * Does not post ledger. Does not mint last/account/TIF/proof.
 */
export async function postMatchingSubmit(command: unknown, options: MatchingPortOptions = {}): Promise<MatchingPortResult> {
  const parsed = commandRefuse(command);
  if (!parsed.ok) {
    return parsed;
  }
  const base = readMatchingBaseUrl(options.matchingBaseUrl ?? process.env.MATCHING_BASE_URL);
  if (!base.ok) {
    return base;
  }
  const body = toMatchingSubmitBody(parsed.command);
  const payload = JSON.stringify(body);
  const path = matchingSubmitPath(parsed.command);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base.url}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      signal: controller.signal,
    });
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      return classifyHttpStatus(response.status, text.slice(0, 500));
    }
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      return refuse('matching_rejected', 'matching submit returned non-JSON; svc-fix does not invent a fill');
    }
    return parseAck(json);
  } catch (err) {
    if (isAbort(err) || controller.signal.aborted) {
      return refuse('matching_timeout', 'matching submit timed out; svc-fix does not invent a fill');
    }
    const detail = err instanceof Error ? err.message : 'unknown';
    return refuse('matching_unavailable', `matching submit unreachable: ${detail}; svc-fix does not invent a fill`);
  } finally {
    clearTimeout(timer);
  }
}

/** Adapter refuse (including unsupported BeginString) never touches HTTP. */
export async function postAdaptedNewOrder(adapted: unknown, options: MatchingPortOptions = {}): Promise<MatchingPortResult> {
  const parsed = adaptResultSchema.safeParse(adapted);
  if (!parsed.success) {
    return refuse('invalid_message', 'adapt result is not a NewOrderSingle envelope');
  }
  if (!parsed.data.ok) {
    return parsed.data;
  }
  return postMatchingSubmit(parsed.data.command, options);
}

export type { AdaptResult, MatchingOrderCommand };
