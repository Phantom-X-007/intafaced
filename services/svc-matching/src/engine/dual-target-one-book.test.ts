/**
 * D26-P2-06 residual · D-S-06 (Accepted) + house-desk fairness §2/§5.
 *
 * Promise:
 *   - One matching book per market (no house parallel book / second runtime in Fiat).
 *   - No structural house preference inside the matcher — account ids are opaque;
 *     FIFO + price-time only. "Structural first-class access" (§28:774) is ownership
 *     of the venue, not a branch on tenant identity in `book.ts` / `engine.ts`.
 *
 * Break:
 *   - A `house*` account jumping the queue at the same price.
 *   - A worse house quote beating a better customer quote.
 *   - Any matching-path branch on house/tenant/vip/plane identity.
 *
 * Done bar (board): one book semantics; no structural house prefer — asserted by
 * behavioural pins + source scan, not a comment.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatAmount, parseAmount } from '@intafaced/ledger-client/money';
import { OrderBook } from './book.js';
import type { EngineOrder, OrderSide, SubmitResult, TimeInForce } from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const A = parseAmount;

function order(spec: { id: string; account: string; side: OrderSide; qty: string; price: string; tif?: TimeInForce }): EngineOrder {
  return {
    orderId: spec.id,
    accountId: spec.account,
    type: 'limit',
    side: spec.side,
    qty: A(spec.qty),
    price: A(spec.price),
    stopPrice: null,
    tif: spec.tif ?? 'GTC',
  };
}

function seed(book: OrderBook, spec: Parameters<typeof order>[0]): void {
  const result = book.submit(order(spec));
  expect(result.accepted, `seed rejected: ${result.rejected?.code}`).toBe(true);
}

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

function engineSources(): { readonly name: string; readonly text: string }[] {
  return readdirSync(HERE)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((name) => ({ name, text: readFileSync(join(HERE, name), 'utf8') }));
}

/** Fill sequence fingerprint independent of which account labels were used. */
function fillFingerprint(result: SubmitResult): string[] {
  return result.fills.map((f) => `${f.makerOrderId}>${f.takerOrderId}@${formatAmount(f.price)}x${formatAmount(f.qty)}`);
}

describe('D26-P2-06 dual-target one-book · no structural house prefer', () => {
  it('EngineOrder has no tenant / house / plane privilege field (one book semantics)', () => {
    const types = readFileSync(join(HERE, 'types.ts'), 'utf8');
    const iface = types.slice(types.indexOf('export interface EngineOrder'), types.indexOf('export const REJECT_CODES'));
    expect(iface).toContain('accountId');
    expect(iface).not.toMatch(/\b(tenant|house|vip|plane|preference|priorityBoost|isInternal)\b/i);
  });

  it('matching path never branches on house / tenant / vip identity (source scan)', () => {
    // Allowed: comments naming "house MM" for STP recovery context, and the
    // opaque `accountId ===` self-trade check (identity of the *same* account,
    // not a privileged tenant class). Forbidden: any privilege discriminator.
    const forbidden: readonly { readonly pattern: RegExp; readonly why: string }[] = [
      { pattern: /\bhouseTenant\b|\bisHouse\b|\bHOUSE_/, why: 'house-tenant privilege flag' },
      { pattern: /\btenantId\b|\btenantKind\b|\btenantType\b/, why: 'tenant-class branch' },
      { pattern: /\bvip\b|\bpriorityBoost\b|\bqueueJump\b/i, why: 'queue privilege' },
      { pattern: /\binternalPreference|\bpreferInternal\b|\bhousePrefer/i, why: 'structural house preference' },
      { pattern: /\bif\s*\([^)]*house[^)]*\)/i, why: 'if-branch on house identity' },
      { pattern: /\.accountId\s*===\s*['"]house/i, why: 'literal house account privilege' },
      { pattern: /\bincludes\(\s*['"]house/i, why: 'house allowlist in matcher' },
    ];

    for (const { name, text } of engineSources()) {
      const body = stripComments(text);
      for (const rule of forbidden) {
        expect(body, `${name}: ${rule.why}`).not.toMatch(rule.pattern);
      }
    }
  });

  it('house resting later at the same price does not jump the customer queue', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { id: 'cust-first', account: 'customer-a', side: 'sell', qty: '1', price: '100' });
    seed(book, { id: 'house-second', account: 'house-mm', side: 'sell', qty: '1', price: '100' });

    const take = book.submit(order({ id: 'taker', account: 'customer-b', side: 'buy', qty: '1', price: '100' }));

    expect(take.accepted).toBe(true);
    expect(take.fills).toHaveLength(1);
    expect(take.fills[0]!.makerOrderId).toBe('cust-first');
    expect(take.fills[0]!.makerAccountId).toBe('customer-a');
  });

  it('a worse house quote loses to a better customer quote even when house arrived first', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { id: 'house-worse', account: 'house-mm', side: 'sell', qty: '1', price: '101' });
    seed(book, { id: 'cust-better', account: 'customer-a', side: 'sell', qty: '1', price: '100' });

    const take = book.submit(order({ id: 'taker', account: 'customer-b', side: 'buy', qty: '1', price: '101' }));

    expect(take.fills.map((f) => f.makerOrderId)).toEqual(['cust-better']);
    expect(formatAmount(take.fills[0]!.price)).toBe('100');
  });

  it('house as taker still pays the resting maker price (no house price prefer)', () => {
    const book = new OrderBook('BTC/USDT');
    seed(book, { id: 'cust-maker', account: 'customer-a', side: 'sell', qty: '1', price: '100' });

    const take = book.submit(order({ id: 'house-taker', account: 'house-mm', side: 'buy', qty: '1', price: '105' }));

    expect(take.fills).toHaveLength(1);
    expect(take.fills[0]!.makerOrderId).toBe('cust-maker');
    expect(formatAmount(take.fills[0]!.price)).toBe('100');
    expect(take.fills[0]!.takerAccountId).toBe('house-mm');
  });

  it('relabelling accounts house↔customer leaves the fill fingerprint unchanged (opaque ids)', () => {
    const run = (a: string, b: string): string[] => {
      const book = new OrderBook('ETH/USDT');
      seed(book, { id: 'm1', account: a, side: 'sell', qty: '2', price: '50' });
      seed(book, { id: 'm2', account: b, side: 'sell', qty: '2', price: '50' });
      const take = book.submit(order({ id: 't', account: 'taker', side: 'buy', qty: '3', price: '50' }));
      return fillFingerprint(take);
    };

    expect(run('house-mm', 'customer-a')).toEqual(run('customer-a', 'house-mm'));
    expect(run('house-mm', 'customer-a')).toEqual(['m1>t@50x2', 'm2>t@50x1']);
  });

  it('MatchingEngine keeps one OrderBook map — no parallel houseBooks field', () => {
    const engineSrc = readFileSync(join(HERE, 'engine.ts'), 'utf8');
    const body = stripComments(engineSrc);
    expect(body).toMatch(/private readonly books = new Map<MarketId, OrderBook>/);
    expect(body).not.toMatch(/\bhouseBooks\b|\binternalBooks\b|\bsecondBook\b|\bparallelBook\b/);
  });
});
