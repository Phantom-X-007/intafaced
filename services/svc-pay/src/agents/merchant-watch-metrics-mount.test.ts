import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MERCHANT_WATCH_METRICS_PATH, MERCHANT_WATCH_METRICS_PUBLISH_PATH } from './merchant-watch-metrics-routes.js';

const here = dirname(fileURLToPath(import.meta.url));
const indexSrc = () => readFileSync(join(here, '..', 'index.ts'), 'utf8');

describe('merchant watch metrics mount', () => {
  it('index registers S2S routes at boot', () => {
    const src = indexSrc();
    expect(src).toContain('registerMerchantWatchMetricsRoutes');
    expect(src).toContain('internalSecret: env.INTERNAL_SERVICE_SECRET');
  });

  it('exports stable paths for svc-agents HTTP port', () => {
    expect(MERCHANT_WATCH_METRICS_PATH).toBe('/internal/agents/merchant-watch-metrics');
    expect(MERCHANT_WATCH_METRICS_PUBLISH_PATH).toBe('/internal/agents/merchant-watch-metrics/publish');
  });
});
