import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client';
import { SERVICE_BODY_DIGEST_HEADER, SERVICE_HEADER, SERVICE_SIGNATURE_HEADER } from '@intafaced/contracts';
import {
  DROPCOPY_HOUSE_SOURCE,
  DROPCOPY_INGEST_PATH,
  createDropCopyPublisher,
  dropCopyFillBody,
  fireDropCopyFill,
  NoopDropCopyPublisher,
  type DropCopyFillReport,
} from './drop-copy-publish.js';

const SECRET = 'test-internal-service-secret-32ch!!';

const fill: DropCopyFillReport = {
  fillId: 'fill-7',
  orderId: 'ord-1',
  userId: 'user-1',
  marketId: 'BTC/USDT',
  side: 'buy',
  price: parseAmount('100.25'),
  qty: parseAmount('1.50'),
  quoteAmount: parseAmount('150.375'),
  feeAsset: 'USDT',
  feeAmount: parseAmount('0.15'),
  sequence: 11,
  ts: '2026-09-18T00:00:00Z',
};

describe('drop-copy fill body', () => {
  it('money fields are decimal strings; source is rest; no ledger key', () => {
    const body = dropCopyFillBody(fill);
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed).toEqual({
      fillId: 'fill-7',
      orderId: 'ord-1',
      userId: 'user-1',
      marketId: 'BTC/USDT',
      side: 'buy',
      price: '100.25',
      qty: '1.5',
      quoteAmount: '150.375',
      feeAsset: 'USDT',
      feeAmount: '0.15',
      sequence: 11,
      ts: '2026-09-18T00:00:00Z',
      source: DROPCOPY_HOUSE_SOURCE,
    });
    expect(typeof parsed.price).toBe('string');
    expect(typeof parsed.qty).toBe('string');
    expect(typeof parsed.quoteAmount).toBe('string');
    expect(typeof parsed.feeAmount).toBe('string');
    expect(body.toLowerCase()).not.toContain('ledger');
    expect(parsed.source).not.toBe('ui');
  });
});

describe('createDropCopyPublisher', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('blank URL is a noop — does not invent a port or fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(createDropCopyPublisher('', SECRET).publish(fill)).resolves.toBeUndefined();
    await expect(createDropCopyPublisher('   ', SECRET).publish(fill)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('non-URL refuses rather than inventing a listen port', () => {
    expect(() => createDropCopyPublisher('19002', SECRET)).toThrow(/does not invent a drop-copy listen port/);
    expect(() => createDropCopyPublisher('svc-fix:19002', SECRET)).toThrow(/does not invent a drop-copy listen port/);
  });

  it('POSTs body-bound HMAC to ingest path; origin-only appends the path', async () => {
    const calls: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({
        url: String(url),
        body: String(init.body),
        headers: init.headers as Record<string, string>,
      });
      return { ok: true, status: 200 } as Response;
    });
    const port = createDropCopyPublisher('http://svc-fix:19002', SECRET);
    await port.publish(fill);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`http://svc-fix:19002${DROPCOPY_INGEST_PATH}`);
    expect(calls[0]!.headers['content-type']).toBe('application/json');
    expect(calls[0]!.headers[SERVICE_HEADER]).toBe('svc-trade');
    expect(calls[0]!.headers[SERVICE_BODY_DIGEST_HEADER]).toBeTruthy();
    expect(calls[0]!.headers[SERVICE_SIGNATURE_HEADER]).toBeTruthy();
    expect(JSON.parse(calls[0]!.body).source).toBe('rest');
    expect(typeof JSON.parse(calls[0]!.body).price).toBe('string');
  });
});

describe('wiring', () => {
  it('settleFill reports after ledger post; does not post the ledger on the FIX path', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const trade = readFileSync(join(here, 'trade-service.ts'), 'utf8');
    const publisher = readFileSync(join(here, 'drop-copy-publish.ts'), 'utf8');
    expect(trade).toContain('await this.notifyDropCopy({');
    expect(trade).toContain('this.dropCopy = options.dropCopy ?? new NoopDropCopyPublisher()');
    expect(publisher).not.toContain('ledger.post');
    expect(publisher).not.toContain('recipes.');
    expect(publisher).toContain('Report only');
    const index = readFileSync(join(here, '../index.ts'), 'utf8');
    expect(index).toContain('createDropCopyPublisher(env.FIX_DROPCOPY_INGEST_URL');
    expect(index).toContain('dropCopy,');
  });
});

describe('fireDropCopyFill', () => {
  it('swallows ingest failure so the fill stays posted', async () => {
    const port = {
      publish: async () => {
        throw new Error('ingest down');
      },
    };
    await expect(fireDropCopyFill(port, fill)).resolves.toBeUndefined();
  });

  it('Noop never throws', async () => {
    await expect(fireDropCopyFill(new NoopDropCopyPublisher(), fill)).resolves.toBeUndefined();
  });
});
