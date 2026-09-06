/**
 * D26-P1-C4 — paper flag is not taken on trust from the caller.
 *
 * Stage-2 already refuses `paper !== true` on the claimed market. That still
 * left a hole: a caller could send `paper: true` for a live listing and get a
 * labelled drill. Academy never posts the ledger either way, but the label
 * would be a lie.
 *
 * Leverage: trade's public REST already emits `paper?: boolean` on
 * `GET /api/v1/markets` (CCXT present). This module CONSUMES that listing.
 * It does not import svc-trade, invent fills, or hold a balance.
 *
 * Fail closed:
 *   · no verification port (TRADE_URL unset) → `academy.paper_flag_unverified`
 *   · port set but listing page size unpublished → `academy.paper_markets_limit_unset`
 *   · port set but listing unreachable / HTTP error (incl. trade 400
 *     `trade.markets_limit_unset`) → `academy.paper_flag_unavailable`
 *   · market not on the listing → `academy.paper_market_unlisted`
 *   · listing `paper !== true` while the caller claimed true → `academy.paper_flag_mismatch`
 */

import { AcademyError } from '../errors.js';
import type { PaperMarketRef } from './workbook-loop.js';

export type ListedPaperFlag = {
  readonly marketId: string;
  readonly symbol: string;
  readonly paper: boolean;
};

export type PaperMarketFlagPort = {
  lookup(marketId: string, symbol: string): Promise<ListedPaperFlag | null>;
};

export type TradePublicPaperFlagOptions = {
  readonly baseUrl: string;
  /**
   * Owner-published page size for `GET /api/v1/markets?limit=` (trade 1..500).
   * Unset refuses `academy.paper_markets_limit_unset` — never invent 50.
   */
  readonly limit?: number;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
};

/** Trade public markets page cap. Out of 1..500 is unpublished — never clamp-invent. */
export const PAPER_MARKETS_LIMIT_MAX = 500;

export function assertPaperMarketsListLimit(limit: unknown): number {
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > PAPER_MARKETS_LIMIT_MAX) {
    throw new AcademyError('Paper markets listing limit is unset — pass limit (never invent 50)', 'academy.paper_markets_limit_unset');
  }
  return limit;
}

type PublicMarketRow = {
  readonly id?: unknown;
  readonly symbol?: unknown;
  readonly paper?: unknown;
};

function refuse(
  code:
    | 'academy.paper_flag_unverified'
    | 'academy.paper_flag_mismatch'
    | 'academy.paper_market_unlisted'
    | 'academy.paper_flag_unavailable'
    | 'academy.paper_markets_limit_unset',
  message: string,
): never {
  throw new AcademyError(message, code);
}

/** In-process listing for tests — never a production fallback. */
export function memoryPaperFlagPort(rows: readonly ListedPaperFlag[]): PaperMarketFlagPort {
  return {
    async lookup(marketId, symbol) {
      const id = marketId.trim();
      const byId = rows.find((r) => r.marketId === id);
      if (byId) return byId;
      const bySymbol = rows.find((r) => r.symbol === symbol);
      return bySymbol ?? null;
    },
  };
}

/**
 * Trade public markets listing. Callers construct this only when TRADE_URL is
 * set. Unset URL must stay `undefined` so the drill refuses unverified.
 */
export function createTradePublicPaperFlagPort(options: TradePublicPaperFlagOptions): PaperMarketFlagPort {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 3_000;
  const base = options.baseUrl.replace(/\/+$/, '');

  return {
    async lookup(marketId, symbol) {
      const page = assertPaperMarketsListLimit(options.limit);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        let response: Response;
        try {
          response = await doFetch(`${base}/api/v1/markets?limit=${encodeURIComponent(String(page))}`, {
            method: 'GET',
            signal: controller.signal,
          });
        } catch (err) {
          refuse(
            'academy.paper_flag_unavailable',
            `Trade markets listing unreachable (${(err as Error).message}) — refuse paper drill rather than trust the caller.`,
          );
        }
        if (!response.ok) {
          refuse(
            'academy.paper_flag_unavailable',
            `Trade markets listing HTTP ${response.status} — refuse paper drill rather than trust the caller.`,
          );
        }
        const body = (await response.json().catch(() => null)) as unknown;
        if (!Array.isArray(body)) {
          refuse(
            'academy.paper_flag_unavailable',
            'Trade markets listing was unreadable — refuse paper drill rather than trust the caller.',
          );
        }
        const wantedId = marketId.trim();
        const wantedSymbol = symbol.trim();
        let match: ListedPaperFlag | null = null;
        for (const row of body as PublicMarketRow[]) {
          const id = typeof row?.id === 'string' ? row.id : '';
          const sym = typeof row?.symbol === 'string' ? row.symbol : '';
          if (!id || !sym) continue;
          const listed: ListedPaperFlag = { marketId: id, symbol: sym, paper: row.paper === true };
          if (id === wantedId || sym === wantedSymbol) {
            match = listed;
            if (id === wantedId) break;
          }
        }
        return match;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Public-door gate. Missing/false paper is left to the workbook loop
 * (`not_paper` / `no_market`). A claimed `paper: true` MUST be confirmed by
 * the verification port — never by the wire body.
 */
export async function assertCallerCannotLiePaperFlag(port: PaperMarketFlagPort | undefined, claimed: PaperMarketRef | null): Promise<void> {
  if (!claimed) return;
  if (claimed.paper !== true) return;

  if (!port) {
    refuse(
      'academy.paper_flag_unverified',
      'TRADE_URL unset — paper flag cannot be verified against trade public markets. Refuse rather than trust paper: true.',
    );
  }

  const listed = await port.lookup(claimed.marketId, claimed.symbol);
  if (!listed) {
    refuse(
      'academy.paper_market_unlisted',
      `Market ${claimed.marketId} is not on trade's public listing — refuse paper drill rather than trust the caller.`,
    );
  }
  if (listed.marketId !== claimed.marketId.trim() || listed.symbol !== claimed.symbol.trim()) {
    refuse(
      'academy.paper_flag_mismatch',
      `Caller market ${claimed.marketId}/${claimed.symbol} does not match trade listing ${listed.marketId}/${listed.symbol} — refuse rather than trust the wire.`,
    );
  }
  if (listed.paper !== true) {
    refuse(
      'academy.paper_flag_mismatch',
      `Trade lists ${listed.marketId} as live (paper≠true). Caller paper: true is a lie — refuse (no live drill).`,
    );
  }
}
