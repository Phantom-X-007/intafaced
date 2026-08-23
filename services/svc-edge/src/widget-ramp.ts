import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Embeddable ramp widget — packaging, not a second pay stack.
 *
 * Third-party hosts iframe GET /api/widget/ramp. The page itself iframes the
 * existing `/bank/ramps` surface and the existing pay checkout. Unset
 * INFRA_LICENCE refuses with a named code. White-label is CSS / tenant env.
 */

export const WIDGET_RAMP_PATH = '/api/widget/ramp' as const;
export const WIDGET_RAMPS_SRC = '/bank/ramps' as const;
export const WIDGET_CHECKOUT_SRC = '/api/pay/checkout' as const;
export const INFRA_LICENCE_UNSET = 'ops.infra_licence_unset' as const;
export const WIDGET_DEFAULT_ACCENT = '#ff6b00' as const;

export interface WidgetRampConfig {
  readonly licence: string | undefined;
  readonly accent?: string | undefined;
  readonly tenantCss?: string | undefined;
}

const HEX_ACCENT = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function licenceIsSet(licence: string | undefined): boolean {
  return typeof licence === 'string' && licence.trim().length > 0;
}

export function widgetAccent(raw: string | undefined): string {
  if (typeof raw === 'string' && HEX_ACCENT.test(raw.trim())) return raw.trim();
  return WIDGET_DEFAULT_ACCENT;
}

/** Operator CSS only — strip a closing style tag so env cannot break out of the sheet. */
export function tenantCss(raw: string | undefined): string {
  if (typeof raw !== 'string' || raw.length === 0) return '';
  return raw.replace(/<\/style/gi, '');
}

function allowFraming(reply: FastifyReply): void {
  reply.removeHeader('x-frame-options');
  reply.header('content-security-policy', 'frame-ancestors *');
  reply.header('content-type', 'text/html; charset=utf-8');
  reply.header('cache-control', 'no-store');
}

function page(title: string, accent: string, extraCss: string, body: string): string {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${title}</title>` +
    '<style>' +
    `:root{--ix-bg:#000;--ix-accent:${accent};--ix-text:#f5f5f5;--ix-dim:#9a9a9a}` +
    'html,body{margin:0;height:100%;background:var(--ix-bg);color:var(--ix-text);font:14px/1.45 system-ui,sans-serif}' +
    '.ix-widget{display:flex;flex-direction:column;height:100%;min-height:480px}' +
    '.ix-bar{display:flex;gap:8px;padding:10px 12px;border-bottom:1px solid #222;background:#0a0a0a}' +
    '.ix-bar a,.ix-bar span{color:var(--ix-accent);text-decoration:none}' +
    '.ix-panes{display:flex;flex-direction:column;flex:1;min-height:0}' +
    '.ix-pane{flex:1;min-height:220px;border:0;width:100%;background:#000}' +
    '.ix-refuse{display:flex;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center}' +
    '.ix-refuse code{display:block;color:var(--ix-accent);font-size:16px;letter-spacing:.04em}' +
    extraCss +
    '</style></head><body>' +
    body +
    '</body></html>'
  );
}

export function renderLicenceRefuse(accent: string, extraCss: string): string {
  return page(
    INFRA_LICENCE_UNSET,
    accent,
    extraCss,
    `<main class="ix-widget"><div class="ix-refuse"><code id="ix-refuse">${INFRA_LICENCE_UNSET}</code></div></main>`,
  );
}

export function renderRampWidget(accent: string, extraCss: string): string {
  return page(
    'INTAFACED ramp',
    accent,
    extraCss,
    '<main class="ix-widget">' +
      '<nav class="ix-bar">' +
      `<a href="${WIDGET_RAMPS_SRC}" target="_top">Ramp</a>` +
      `<a href="${WIDGET_CHECKOUT_SRC}" target="_top">Checkout</a>` +
      '</nav>' +
      '<div class="ix-panes">' +
      `<iframe class="ix-pane" src="${WIDGET_RAMPS_SRC}" title="ramp"></iframe>` +
      `<iframe class="ix-pane" src="${WIDGET_CHECKOUT_SRC}" title="checkout"></iframe>` +
      '</div></main>',
  );
}

export function registerWidgetRampRoute(app: FastifyInstance, config: WidgetRampConfig): void {
  const accent = widgetAccent(config.accent);
  const extraCss = tenantCss(config.tenantCss);
  const licensed = licenceIsSet(config.licence);

  const send = async (_req: FastifyRequest, reply: FastifyReply) => {
    allowFraming(reply);
    if (!licensed) {
      return reply.code(403).send(renderLicenceRefuse(accent, extraCss));
    }
    return reply.code(200).send(renderRampWidget(accent, extraCss));
  };

  app.get(
    WIDGET_RAMP_PATH,
    {
      // Helmet has no skipRoute on FastifyContextConfig. Framing is lifted in
      // onSend / allowFraming so the document can be the embed target.
      onSend: framingOnSend,
    },
    send,
  );
}

async function framingOnSend(_req: FastifyRequest, reply: FastifyReply, payload: unknown): Promise<unknown> {
  allowFraming(reply);
  return payload;
}
