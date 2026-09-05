/**
 * D26-P1-P8 — pay.plugins Done bar (public doors).
 *
 * Promise: one real plugin path (TS reference client) + honest §13 for PHP CMS.
 * Breaks caught:
 *   · create → authorize → capture → refund contract pins drift (path / headers / amount);
 *   · webhook register accepts http and invents a store remote;
 *   · sendPluginRequest never exercises the live fetch door (build-only theater);
 *   · HMAC verify silently accepts a tampered capture body.
 *
 * Enter through build* + sendPluginRequest against a real HTTP stub.
 * No money book, no invent fees, no PHP CMS tree.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  buildAuthorizePaymentRequest,
  buildCapturePaymentRequest,
  buildCreatePaymentRequest,
  buildGetPaymentRequest,
  buildListWebhookDeliveriesRequest,
  buildRefundRequest,
  buildRegisterWebhookEndpointRequest,
  sendPluginRequest,
  signMerchantWebhook,
  verifyMerchantWebhook,
} from './reference-client.js';
import { FROZEN_CAPTURED_BODY, frozenWebhookVectors } from './webhook-vectors.js';

type Seen = {
  method: string;
  url: string;
  auth?: string;
  idem?: string;
  body: string;
};

async function withStub(
  handler: (req: IncomingMessage, res: ServerResponse, body: string) => void,
  run: (baseUrl: string, seen: Seen[]) => Promise<void>,
): Promise<void> {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      seen.push({
        method: req.method ?? '',
        url: req.url ?? '',
        auth: typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined,
        idem: typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : undefined,
        body,
      });
      handler(req, res, body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no port');
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    await run(baseUrl, seen);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

describe('D26-P1-P8 pay.plugins Done bar — reference client public doors', () => {
  it('ONE store lifecycle: create → get → authorize → capture → refund (decimal + idempotency)', async () => {
    await withStub(
      (req, res) => {
        const path = req.url ?? '';
        if (req.method === 'POST' && path === '/api/pay/v1/payments') {
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id: 'pay_life', status: 'created', amount: '25.00' }));
          return;
        }
        if (req.method === 'GET' && path === '/api/pay/v1/payments/pay_life') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id: 'pay_life', status: 'created', amount: '25.00' }));
          return;
        }
        if (req.method === 'POST' && path.endsWith('/authorize')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id: 'pay_life', status: 'authorized' }));
          return;
        }
        if (req.method === 'POST' && path.endsWith('/capture')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id: 'pay_life', status: 'captured', amount: '25.00' }));
          return;
        }
        if (req.method === 'POST' && path.endsWith('/refund')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id: 'refund_1', status: 'posted', amount: '5.00' }));
          return;
        }
        res.writeHead(404);
        res.end('missing');
      },
      async (baseUrl, seen) => {
        const apiKey = 'ifc_plugin_done_bar';
        const opts = { baseUrl, apiKey };

        const create = buildCreatePaymentRequest(
          opts,
          { merchantId: 'm_store', amount: '25.00', assetId: 'USDT', method: 'card' },
          'life-create-1',
        );
        const created = await sendPluginRequest(opts, create);
        expect(created.status).toBe(201);
        expect((created.body as { id: string }).id).toBe('pay_life');

        const got = await sendPluginRequest(opts, buildGetPaymentRequest(opts, 'pay_life'));
        expect(got.status).toBe(200);
        expect(typeof (got.body as { amount: unknown }).amount).toBe('string');

        const auth = await sendPluginRequest(opts, buildAuthorizePaymentRequest(opts, 'pay_life', 'life-auth-1'));
        expect(auth.status).toBe(200);
        expect((auth.body as { status: string }).status).toBe('authorized');

        const cap = await sendPluginRequest(opts, buildCapturePaymentRequest(opts, 'pay_life', 'life-cap-1'));
        expect(cap.status).toBe(200);
        expect((cap.body as { status: string }).status).toBe('captured');

        const refund = await sendPluginRequest(
          opts,
          buildRefundRequest(opts, 'pay_life', { amount: '5.00', refundId: 'refund_1' }, 'life-refund-1'),
        );
        expect(refund.status).toBe(200);
        expect(typeof (refund.body as { amount: unknown }).amount).toBe('string');

        expect(seen.map((s) => `${s.method} ${s.url}`)).toEqual([
          'POST /api/pay/v1/payments',
          'GET /api/pay/v1/payments/pay_life',
          'POST /api/pay/v1/payments/pay_life/authorize',
          'POST /api/pay/v1/payments/pay_life/capture',
          'POST /api/pay/v1/payments/pay_life/refund',
        ]);
        for (const s of seen.filter((x) => x.method === 'POST')) {
          expect(s.auth).toBe(`Bearer ${apiKey}`);
          expect(s.idem).toMatch(/^life-/);
        }
        const createBody = JSON.parse(seen[0]!.body) as { amount: unknown };
        expect(createBody.amount).toBe('25.00');
        expect(typeof createBody.amount).toBe('string');
        expect(absoluteUrl(opts, create.path)).toBe(`${baseUrl}/api/pay/v1/payments`);
      },
    );
  });

  it('webhook install door: https register + list deliveries; http refuse before send', async () => {
    expect(() =>
      buildRegisterWebhookEndpointRequest(
        { baseUrl: 'https://pay.example.test', apiKey: 'k' },
        { merchantId: 'm1', url: 'http://merchant.example/hooks' },
      ),
    ).toThrow(/https/);

    await withStub(
      (req, res) => {
        if (req.method === 'POST' && req.url === '/api/pay/v1/webhook-endpoints') {
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id: 'wh_1', secret: 'whsec_once', url: 'https://merchant.example/hooks/pay' }));
          return;
        }
        if (req.method === 'GET' && (req.url ?? '').startsWith('/api/pay/v1/webhook-deliveries')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ items: [{ id: 'del_1', status: 'failed' }] }));
          return;
        }
        res.writeHead(404);
        res.end('missing');
      },
      async (baseUrl, seen) => {
        const opts = { baseUrl, apiKey: 'ifc_wh' };
        const reg = await sendPluginRequest(
          opts,
          buildRegisterWebhookEndpointRequest(opts, {
            merchantId: 'm1',
            url: 'https://merchant.example/hooks/pay',
          }),
        );
        expect(reg.status).toBe(201);
        expect((reg.body as { secret: string }).secret).toBe('whsec_once');

        const deliveries = await sendPluginRequest(opts, buildListWebhookDeliveriesRequest(opts, 'm1', { status: 'failed', limit: 50 }));
        expect(deliveries.status).toBe(200);
        expect((deliveries.body as { items: unknown[] }).items).toHaveLength(1);
        expect(seen[0]!.url).toBe('/api/pay/v1/webhook-endpoints');
        expect(seen[1]!.url).toContain('status=failed');
      },
    );
  });

  it('frozen capture vector verifies; tamper refuses — store plugin cannot invent signatures', () => {
    const v =
      frozenWebhookVectors().find((x) => x.name.includes('captured') || x.rawBody.includes('captured')) ?? frozenWebhookVectors()[0]!;
    const now = new Date(Number(v.timestampSeconds) * 1000);
    expect(
      verifyMerchantWebhook({
        secret: v.secret,
        rawBody: v.rawBody,
        signatureHex: v.signatureHex,
        timestampSeconds: v.timestampSeconds,
        now,
        toleranceSeconds: 300,
      }),
    ).toBe(true);
    expect(signMerchantWebhook(v.secret, v.timestampSeconds, v.rawBody)).toBe(v.signatureHex);

    const captured = JSON.parse(FROZEN_CAPTURED_BODY) as { data: { amount: unknown } };
    expect(typeof captured.data.amount).toBe('string');
    expect(
      verifyMerchantWebhook({
        secret: v.secret,
        rawBody: v.rawBody.replace('"', "'"),
        signatureHex: v.signatureHex,
        timestampSeconds: v.timestampSeconds,
        now,
        toleranceSeconds: 300,
      }),
    ).toBe(false);
  });
});
