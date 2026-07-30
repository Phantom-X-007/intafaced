import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import {
  escapeHtml,
  extractCheckoutToken,
  registerCheckoutRoutes,
  renderCheckoutPage,
  type CheckoutLinkView,
  type CheckoutPay,
} from './checkout-page.js';

function payErr(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

const stubLink: CheckoutLinkView = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  merchantId: '11111111-1111-4111-8111-111111111111',
  profileId: null,
  label: 'Invoice #42 — café & co',
  amount: '19.99',
  currency: 'USD',
  checkoutConfig: { displayName: 'Acme Widgets' },
};

describe('checkout page rendering', () => {
  it('includes the link label and amount for a resolved payment link', () => {
    const { status, html } = renderCheckoutPage({ kind: 'ok', link: stubLink });

    expect(status).toBe(200);
    expect(html).toContain('Invoice #42 — café &amp; co');
    expect(html).toContain('19.99');
    expect(html).toContain('USD');
    expect(html).toContain('Acme Widgets');
    expect(html).toContain('Complete payment in the merchant app');
    // No card fields / inventing a rail
    expect(html.toLowerCase()).not.toContain('card number');
    expect(html.toLowerCase()).not.toContain('<form');
  });

  it('renders honest empty and error states', () => {
    expect(renderCheckoutPage({ kind: 'missing_token' }).status).toBe(400);
    expect(renderCheckoutPage({ kind: 'not_found' }).html).toContain('Link not found');
    expect(renderCheckoutPage({ kind: 'expired' }).status).toBe(410);
    expect(renderCheckoutPage({ kind: 'expired' }).html).toContain('expired');
  });

  it('escapes merchant-supplied label HTML', () => {
    expect(escapeHtml(`<script>alert(1)</script>`)).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    const { html } = renderCheckoutPage({
      kind: 'ok',
      link: { ...stubLink, label: `<img src=x onerror=alert(1)>` },
    });
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
  });
});

describe('extractCheckoutToken', () => {
  it('reads query and path tokens', () => {
    expect(extractCheckoutToken({ queryToken: 'pl_abcdefghijklmnop' })).toBe('pl_abcdefghijklmnop');
    expect(extractCheckoutToken({ pathToken: 'pl_path_token_here' })).toBe('pl_path_token_here');
    expect(extractCheckoutToken({ queryToken: 'short' })).toBeNull();
    expect(extractCheckoutToken({})).toBeNull();
  });
});

/**
 * Route wiring — the page calls resolvePaymentLink and returns HTML that
 * contains the label. Stubbed service; no Postgres required.
 */
describe('GET /checkout route', () => {
  async function build(pay: CheckoutPay) {
    const app = Fastify();
    await registerCheckoutRoutes(app, pay);
    await app.ready();
    return app;
  }

  it('returns HTML that contains the stubbed link label', async () => {
    const app = await build({
      resolvePaymentLink: async () => stubLink,
    });

    const res = await app.inject({ method: 'GET', url: '/checkout?token=pl_stubbed_token_value' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('Invoice #42 — café &amp; co');
    expect(res.body).toContain('19.99');
    await app.close();
  });

  it('resolves path tokens the same way', async () => {
    const app = await build({
      resolvePaymentLink: async (token) => {
        expect(token).toBe('pl_path_style_token_xx');
        return stubLink;
      },
    });

    const res = await app.inject({ method: 'GET', url: '/pay/link/pl_path_style_token_xx' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Invoice #42');
    await app.close();
  });

  it('maps not_found and expired honestly', async () => {
    const notFound = await build({
      resolvePaymentLink: async () => {
        throw payErr('pay.link_not_found', 'payment link not found');
      },
    });
    const r1 = await notFound.inject({ method: 'GET', url: '/checkout?token=pl_missing_token_xx' });
    expect(r1.statusCode).toBe(404);
    expect(r1.body).toContain('Link not found');
    await notFound.close();

    const expired = await build({
      resolvePaymentLink: async () => {
        throw payErr('pay.link_expired', 'payment link expired');
      },
    });
    const r2 = await expired.inject({ method: 'GET', url: '/checkout?token=pl_expired_token_xx' });
    expect(r2.statusCode).toBe(410);
    expect(r2.body).toContain('expired');
    await expired.close();
  });
});
