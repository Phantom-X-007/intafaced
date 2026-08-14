/**
 * THE HOSTED CHECKOUT PAGE.
 *
 * This is the only public, unauthenticated, value-bearing surface svc-pay
 * serves. It renders to somebody who is not logged in, who did not choose to
 * trust us, and who may be an attacker — so the rules it is written to are:
 *
 *   NO SECRETS AND NO ENUMERATION. Merchant ids, link ids, payment ids, profile
 *   configuration and rail adapter ids never reach the browser. What a payer
 *   gets is a label, an amount, and — once a session exists — one rail reference
 *   that belongs to them alone.
 *
 *   NO CLIENT-SIDE AMOUNT. On a fixed-amount link the amount is not in the form
 *   at all, not even as a hidden field: the server reads it off the link and
 *   ignores anything posted, so shipping a field would only advertise an attack
 *   that does not work. On a variable-amount link the payer states an amount
 *   once, at open, and the server freezes it into the session — every page after
 *   that renders the frozen number, never a submitted one.
 *
 *   NO SCRIPT. `script-src 'none'`, and the status poll is a `<meta refresh>`.
 *   A checkout page is the highest-value XSS target in the product, and the
 *   cheapest way to win that argument permanently is to have no script for an
 *   injection to land in.
 *
 *   NO FRAMING, NO CACHING, NO REFERRER. See `send()`.
 *
 * It does NOT collect card details, and it must not until a live acquiring rail
 * exists (see `rails/posture.ts`). A form that took a PAN against a mock
 * acquirer would be the single most dishonest thing in this repository.
 *
 * Browser front door is svc-edge: `/api/pay/checkout?token=…`.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { parseAmount } from '@intafaced/ledger-client';

export type CheckoutLinkView = {
  id: string;
  merchantId: string;
  profileId: string | null;
  label: string;
  amount: string | null;
  currency: string | null;
  expiresAt?: string | null;
  remainingUses?: number | null;
  checkoutConfig: Record<string, unknown>;
  /**
   * The payer's own link token, threaded onto the view so the form can post it
   * back. It is not read from the database and never rendered anywhere except
   * the hidden field — it is already in this payer's address bar, so posting it
   * back grants nothing new.
   */
  token?: string;
};

export type CheckoutSessionPageView = {
  id: string;
  status: 'open' | 'completed' | 'expired' | 'cancelled';
  label: string;
  amount: string;
  currency: string;
  method: string;
  expiresAt: string;
  instruction: { reference: string; amount: string; currency: string } | null;
};

/** The slice of PayService the hosted page needs. Nothing else is reachable from here. */
export type CheckoutPay = {
  resolvePaymentLink(token: string): Promise<CheckoutLinkView>;
  openCheckoutSession(input: {
    linkToken: string;
    amount?: bigint;
    assetId?: string;
    geoCountry?: string;
    method?: string;
  }): Promise<{ sessionToken: string; session: CheckoutSessionPageView }>;
  getCheckoutSession(sessionToken: string): Promise<CheckoutSessionPageView>;
};

/**
 * The prefix the BROWSER sees this page under.
 *
 * svc-pay serves `/checkout`; svc-edge is the only public listener and routes
 * `/api/pay/*` here with the prefix STRIPPED (`services/svc-edge/src/routes.ts`).
 * So the paths this page emits — a form action, a redirect Location — must carry
 * the prefix back, or a form rendered at `/api/pay/checkout` posts to the edge's
 * root and 404s. Empty in unit tests, where the routes are mounted bare.
 */
export type CheckoutPaths = { readonly basePath: string };

const NO_PREFIX: CheckoutPaths = { basePath: '' };

export type CheckoutPageState =
  | { kind: 'ok'; link: CheckoutLinkView }
  | { kind: 'session'; session: CheckoutSessionPageView }
  | { kind: 'missing_token' }
  | { kind: 'not_found' }
  | { kind: 'expired' }
  | { kind: 'exhausted' }
  /** No rail on this deployment can honestly take a public payment. */
  | { kind: 'unavailable' }
  | { kind: 'busy' }
  | { kind: 'amount_required'; link: CheckoutLinkView; message: string }
  | { kind: 'error'; message?: string };

/** Escape for HTML text/attribute contexts. Labels are merchant-supplied. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Pull a payment-link token from query and/or path.
 * Accepts `/checkout?token=…`, `/checkout/:token`, `/pay/link/:token`.
 */
export function extractCheckoutToken(input: { queryToken?: string | string[]; pathToken?: string }): string | null {
  const raw = input.pathToken ?? (Array.isArray(input.queryToken) ? input.queryToken[0] : input.queryToken);
  if (typeof raw !== 'string') return null;
  const token = raw.trim();
  if (token.length < 8 || token.length > 200) return null;
  return token;
}

/**
 * Parse a payer-supplied amount from a form field.
 *
 * `undefined` for absent, `null` for present-but-not-a-decimal-string. The two
 * are different answers: absent on a fixed-amount link is correct and expected,
 * while garbage is a request to be refused rather than coerced. Money never
 * becomes a `number` on the way through here — `parseFloat` on this line is how
 * a payments book gets 0.1 + 0.2 in it.
 */
export function parsePayerAmount(raw: unknown): bigint | null | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(value)) return null;
  try {
    const amount = parseAmount(value);
    return amount > 0n ? amount : null;
  } catch {
    return null;
  }
}

export function renderCheckoutPage(state: CheckoutPageState, paths: CheckoutPaths = NO_PREFIX): { status: number; html: string } {
  switch (state.kind) {
    case 'ok':
      return { status: 200, html: pageShell(linkBody(state.link, paths), state.link.label) };
    case 'session':
      return {
        status: 200,
        html: pageShell(sessionBody(state.session), state.session.label, state.session.status === 'open' ? 10 : undefined),
      };
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
    case 'exhausted':
      return {
        status: 410,
        html: pageShell(
          errorBody('Link already used', 'This payment link has already been paid. Ask the merchant for a new one.'),
          'Link already used',
        ),
      };
    case 'unavailable':
      // WHAT THIS PAGE MUST NOT SAY. Not "try again" — retrying cannot fix it.
      // Not which rail, not what mode it is in, not that a sandbox exists at
      // all. The payer is told the truth at the only level of detail that is
      // theirs: this merchant cannot take payment right now, and nothing has
      // been charged.
      return {
        status: 503,
        html: pageShell(
          errorBody(
            'Payment unavailable',
            'This merchant cannot take payment right now. Nothing has been charged and no payment was started.',
          ),
          'Payment unavailable',
        ),
      };
    case 'busy':
      return {
        status: 429,
        html: pageShell(
          errorBody('Too many checkouts open', 'Too many people are paying this link at once. Try again in a few minutes.'),
          'Too many checkouts open',
        ),
      };
    case 'amount_required':
      return { status: 400, html: pageShell(linkBody(state.link, paths, state.message), state.link.label) };
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
