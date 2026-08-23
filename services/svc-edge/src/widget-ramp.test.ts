import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import helmet from '@fastify/helmet';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  INFRA_LICENCE_UNSET,
  WIDGET_CHECKOUT_SRC,
  WIDGET_DEFAULT_ACCENT,
  WIDGET_RAMP_PATH,
  WIDGET_RAMPS_SRC,
  licenceIsSet,
  registerWidgetRampRoute,
  renderRampWidget,
  tenantCss,
  widgetAccent,
} from './widget-ramp.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const SRC = readFileSync(join(HERE, 'widget-ramp.ts'), 'utf8');
const INDEX = readFileSync(join(HERE, 'index.ts'), 'utf8');

const apps: FastifyInstance[] = [];

afterEach(async () => {
  while (apps.length) {
    const a = apps.pop();
    if (a) await a.close();
  }
});

async function build(licence: string | undefined, extra: { accent?: string; tenantCss?: string } = {}) {
  const app = Fastify({ logger: false });
  await app.register(helmet, {
    contentSecurityPolicy: false,
    frameguard: { action: 'deny' },
  });
  registerWidgetRampRoute(app, { licence, accent: extra.accent, tenantCss: extra.tenantCss });
  await app.ready();
  apps.push(app);
  return app;
}

describe('ops.infra-b2b embeddable ramp widget', () => {
  it('treats missing and blank licence as unset', () => {
    expect(licenceIsSet(undefined)).toBe(false);
    expect(licenceIsSet('')).toBe(false);
    expect(licenceIsSet('   ')).toBe(false);
    expect(licenceIsSet('ifc-licence-1')).toBe(true);
  });

  it('refuses unset licence with named code — HTML, iframeable', async () => {
    const app = await build(undefined);
    const res = await app.inject({ method: 'GET', url: WIDGET_RAMP_PATH });
    expect(res.statusCode).toBe(403);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain(INFRA_LICENCE_UNSET);
    expect(res.body).not.toContain(WIDGET_RAMPS_SRC);
    expect(res.body).not.toContain('iframe src');
    expect(String(res.headers['x-frame-options'] ?? '')).not.toMatch(/deny|sameorigin/i);
  });

  it('serves iframes of existing /bank/ramps and pay checkout when licensed', async () => {
    const app = await build('set');
    const res = await app.inject({ method: 'GET', url: WIDGET_RAMP_PATH });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(`src="${WIDGET_RAMPS_SRC}"`);
    expect(res.body).toContain(`src="${WIDGET_CHECKOUT_SRC}"`);
    expect(res.body).not.toContain(INFRA_LICENCE_UNSET);
    expect(String(res.headers['x-frame-options'] ?? '')).not.toMatch(/deny|sameorigin/i);
  });

  it('does not invent a second pay stack or coerce amounts', () => {
    expect(SRC).not.toMatch(/renderCheckoutPage|openCheckoutSession|checkout-page/);
    expect(SRC).not.toMatch(/\bNumber\s*\(|parseFloat|parseInt/);
    expect(SRC).toContain(WIDGET_CHECKOUT_SRC);
    expect(SRC).toContain(WIDGET_RAMPS_SRC);
    expect(INDEX).toMatch(/registerWidgetRampRoute/);
  });

  it('white-label is CSS / tenant env — query cannot set the sheet', () => {
    expect(widgetAccent('#abc')).toBe('#abc');
    expect(widgetAccent('#ff6b00')).toBe('#ff6b00');
    expect(widgetAccent('red')).toBe(WIDGET_DEFAULT_ACCENT);
    expect(widgetAccent('url(javascript:alert(1))')).toBe(WIDGET_DEFAULT_ACCENT);
    expect(tenantCss('body{color:red}</style><script>x</script>')).not.toMatch(/<\/style/i);
    const html = renderRampWidget(WIDGET_DEFAULT_ACCENT, '');
    expect(html).toContain('--ix-bg:#000');
    expect(html).toContain(WIDGET_DEFAULT_ACCENT);
  });

  it('exact GET wins over /api/* catch-all', async () => {
    const app = Fastify({ logger: false });
    registerWidgetRampRoute(app, { licence: undefined });
    app.all('/api/*', async (_req, reply) => reply.code(404).send({ code: 'edge.no_route' }));
    await app.ready();
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: WIDGET_RAMP_PATH });
    expect(res.statusCode).toBe(403);
    expect(res.body).toContain(INFRA_LICENCE_UNSET);
  });

  it('compose pass-through so a host licence reaches the container', () => {
    const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
    const block = compose.match(/^  svc-edge:\n(?:.*\n)*?(?=^  [a-z]|\Z)/m)?.[0] ?? '';
    expect(block).toMatch(/SERVICE_NAME:\s*svc-edge/);
    expect(block).toMatch(/^\s+INFRA_LICENCE:\s*$/m);
    expect(block).toMatch(/^\s+INFRA_WIDGET_ACCENT:\s*$/m);
    expect(block).toMatch(/^\s+INFRA_WIDGET_CSS:\s*$/m);
  });
});
