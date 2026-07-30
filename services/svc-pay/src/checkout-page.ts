/**
 * Minimal hosted payment-link checkout page.
 *
 * Renders merchant-safe checkout intent only — label, amount, currency.
 * Does not collect cards, process rails, or invent a payment path that is
 * not already on the wire. Card/crypto capture stays on the merchant
 * integration + sandbox rails until a real rail is configured.
 *
 * Browser front door is svc-edge: `/api/pay/checkout?token=…` and
 * `/api/pay/pay/link/:token` proxy to these routes.
 */

import type { FastifyInstance } from 'fastify';

export type CheckoutLinkView = {
  id: string;
  merchantId: string;
  profileId: string | null;
  label: string;
  amount: string | null;
  currency: string | null;
  checkoutConfig: Record<string, unknown>;
};

/** The slice of PayService the hosted page needs. */
export type CheckoutPay = {
  resolvePaymentLink(token: string): Promise<CheckoutLinkView>;
};

export type CheckoutPageState =
  | { kind: 'ok'; link: CheckoutLinkView }
  | { kind: 'missing_token' }
  | { kind: 'not_found' }
  | { kind: 'expired' }
  | { kind: 'error'; message?: string };

/** Escape for HTML text/attribute contexts. Labels are merchant-supplied. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Pull a payment-link token from query and/or path.
 * Accepts `/checkout?token=…`, `/checkout/:token`, `/pay/link/:token`.
 */
export function extractCheckoutToken(input: {
  queryToken?: string | string[];
  pathToken?: string;
}): string | null {
  const raw = input.pathToken ?? (Array.isArray(input.queryToken) ? input.queryToken[0] : input.queryToken);
  if (typeof raw !== 'string') return null;
  const token = raw.trim();
  if (token.length < 8 || token.length > 200) return null;
  return token;
}

export function renderCheckoutPage(state: CheckoutPageState): { status: number; html: string } {
  switch (state.kind) {
    case 'ok':
      return { status: 200, html: pageShell(okBody(state.link), state.link.label) };
    case 'missing_token':
      return {
        status: 400,
        html: pageShell(errorBody('Missing link', 'This checkout URL needs a payment link token.'), 'Missing link'),
      };
    case 'not_found':
      return {
        status: 404,
        html: pageShell(errorBody('Link not found', 'This payment link does not exist or is no longer active.'), 'Link not found'),
      };
    case 'expired':
      return {
        status: 410,
        html: pageShell(errorBody('Link expired', 'This payment link has expired. Ask the merchant for a new one.'), 'Link expired'),
      };
    case 'error':
      return {
        status: 500,
        html: pageShell(
          errorBody('Something went wrong', state.message ?? 'The checkout page could not load this link.'),
          'Checkout error',
        ),
      };
  }
}

function okBody(link: CheckoutLinkView): string {
  const amountLine =
    link.amount !== null && link.currency !== null
      ? `<p class="amount"><span class="num">${escapeHtml(link.amount)}</span> <span class="ccy">${escapeHtml(link.currency)}</span></p>`
      : link.amount !== null
        ? `<p class="amount"><span class="num">${escapeHtml(link.amount)}</span></p>`
        : `<p class="amount muted">Amount set at payment time</p>`;

  // Merchant-safe subset of checkoutConfig only — never dump the whole bag
  // (profiles may later hold routing hints that should not hit the browser).
  const displayName = readSafeString(link.checkoutConfig, 'displayName');
  const merchantLine = displayName
    ? `<p class="merchant">Merchant: ${escapeHtml(displayName)}</p>`
    : '';

  return `
    <header class="head">
      <p class="eyebrow">Payment request</p>
      <h1>${escapeHtml(link.label)}</h1>
      ${merchantLine}
    </header>
    <section class="card" aria-label="Payment details">
      ${amountLine}
      <p class="hint">Card and crypto rails complete in the merchant app or integration. This page shows the request only — it does not take card details or move money.</p>
      <p class="cta" role="status">Complete payment in the merchant app</p>
    </section>
  `;
}

function errorBody(title: string, detail: string): string {
  return `
    <header class="head">
      <p class="eyebrow">Checkout</p>
      <h1>${escapeHtml(title)}</h1>
    </header>
    <section class="card">
      <p class="hint">${escapeHtml(detail)}</p>
    </section>
  `;
}

function readSafeString(config: Record<string, unknown>, key: string): string | null {
  const v = config[key];
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > 120) return null;
  return t;
}

function pageShell(body: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>${escapeHtml(title)} · Checkout</title>
  <style>
    :root { color-scheme: light dark; --bg: #0b0f14; --fg: #e8eef6; --muted: #8b98a8; --card: #141b24; --line: #243041; --accent: #6ea8fe; }
    @media (prefers-color-scheme: light) {
      :root { --bg: #f4f6f8; --fg: #101820; --muted: #5b6b7c; --card: #fff; --line: #d7dee7; --accent: #1a5fd0; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font: 16px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; background: var(--bg); color: var(--fg); display: grid; place-items: center; padding: 1.5rem; }
    main { width: min(28rem, 100%); }
    .eyebrow { margin: 0 0 .35rem; text-transform: uppercase; letter-spacing: .08em; font-size: .75rem; color: var(--muted); }
    h1 { margin: 0 0 .75rem; font-size: 1.45rem; font-weight: 650; line-height: 1.25; word-break: break-word; }
    .merchant { margin: 0 0 1rem; color: var(--muted); font-size: .95rem; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 1.25rem 1.35rem; }
    .amount { margin: 0 0 .9rem; font-size: 1.75rem; font-weight: 650; letter-spacing: -0.02em; }
    .amount .ccy { font-size: 1rem; font-weight: 600; color: var(--muted); }
    .amount.muted { font-size: 1rem; font-weight: 500; color: var(--muted); }
    .hint { margin: 0 0 1rem; color: var(--muted); font-size: .92rem; }
    .cta { margin: 0; padding: .85rem 1rem; text-align: center; border-radius: 8px; border: 1px dashed var(--line); color: var(--accent); font-weight: 600; }
  </style>
</head>
<body>
  <main>
    ${body}
  </main>
</body>
</html>`;
}

/**
 * Public HTML routes for payment links.
 *
 * Anonymous by design — the token is the capability (same as `resolveLink`).
 * No principal header required.
 */
/** Read `PayError.code` (or any error with a string `code`) without importing the service. */
function errorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string') {
    return (err as { code: string }).code;
  }
  return undefined;
}

export async function registerCheckoutRoutes(app: FastifyInstance, pay: CheckoutPay): Promise<void> {
  const handle = async (token: string | null, reply: { code: (n: number) => { type: (t: string) => { send: (b: string) => unknown } } }) => {
    if (!token) {
      const page = renderCheckoutPage({ kind: 'missing_token' });
      return reply.code(page.status).type('text/html; charset=utf-8').send(page.html);
    }
    try {
      const link = await pay.resolvePaymentLink(token);
      const page = renderCheckoutPage({ kind: 'ok', link });
      return reply.code(page.status).type('text/html; charset=utf-8').send(page.html);
    } catch (err) {
      const code = errorCode(err);
      if (code === 'pay.link_not_found') {
        const page = renderCheckoutPage({ kind: 'not_found' });
        return reply.code(page.status).type('text/html; charset=utf-8').send(page.html);
      }
      if (code === 'pay.link_expired') {
        const page = renderCheckoutPage({ kind: 'expired' });
        return reply.code(page.status).type('text/html; charset=utf-8').send(page.html);
      }
      const page = renderCheckoutPage({ kind: 'error' });
      return reply.code(page.status).type('text/html; charset=utf-8').send(page.html);
    }
  };

  app.get<{ Querystring: { token?: string } }>('/checkout', async (request, reply) => {
    const token = extractCheckoutToken({ queryToken: request.query.token });
    return handle(token, reply);
  });

  app.get<{ Params: { token: string } }>('/checkout/:token', async (request, reply) => {
    const token = extractCheckoutToken({ pathToken: request.params.token });
    return handle(token, reply);
  });

  app.get<{ Params: { token: string } }>('/pay/link/:token', async (request, reply) => {
    const token = extractCheckoutToken({ pathToken: request.params.token });
    return handle(token, reply);
  });
}
