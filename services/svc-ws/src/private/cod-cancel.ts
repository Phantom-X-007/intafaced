import type { TradeCancelPort, TradeCancelResult } from './cod.js';

export interface HttpTradeCancelPortOptions {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * User-token forward to svc-trade `DELETE /api/v1/orders`. Not a service secret.
 * Unreachable / non-JSON → `reached: false` — never an invented empty cancel set.
 */
export class HttpTradeCancelPort implements TradeCancelPort {
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: HttpTradeCancelPortOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#timeoutMs = options.timeoutMs ?? 5_000;
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  async cancelAll(input: { accessToken: string; marketId?: string }): Promise<TradeCancelResult> {
    const qs = input.marketId ? `?symbol=${encodeURIComponent(input.marketId)}` : '';
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}/api/v1/orders${qs}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${input.accessToken}` },
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch {
      return { reached: false, reason: 'cod.trade_not_reached' };
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (response.status !== 200) {
      return { reached: true, status: response.status, orders: [] };
    }
    if (!Array.isArray(body)) {
      return { reached: false, reason: 'cod.trade_not_reached' };
    }
    const orders: { orderId: string }[] = [];
    for (const row of body) {
      if (row === null || typeof row !== 'object' || Array.isArray(row)) continue;
      const rec = row as Record<string, unknown>;
      const orderId = typeof rec.orderId === 'string' ? rec.orderId : typeof rec.id === 'string' ? rec.id : null;
      if (orderId) orders.push({ orderId });
    }
    return { reached: true, status: 200, orders };
  }
}
