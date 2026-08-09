/**
 * Unit card — price-alert fire keys are real catalog entries
 * 1. Promise: alerts/service fireNotification uses notify.alert.price.crossed.*
 * 2. Break: missing keys → out-of-app body is the greppable key string (W5 park)
 * 3. Done bar: both keys exist in @intafaced/i18n MESSAGE_KEYS / catalog
 * 4. Class N
 * 5. Paths: packages/i18n + services/svc-notify (one residual; i18n was free)
 * 6. RED pin
 * 7. Collision: claim-check packages/i18n before push
 */

import { describe, expect, it } from 'vitest';
import { MESSAGE_KEYS, createTranslator } from '@intafaced/i18n';

const TITLE = 'notify.alert.price.crossed.title';
const BODY = 'notify.alert.price.crossed.body';

describe('v22.alerts catalog keys pin', () => {
  it('title and body keys are in the English catalog', () => {
    expect(MESSAGE_KEYS).toContain(TITLE);
    expect(MESSAGE_KEYS).toContain(BODY);
  });

  it('renders human copy, not the key string', () => {
    const t = createTranslator('en');
    const title = t.t(TITLE as never);
    const body = t.t(BODY as never, {
      marketId: 'BTC-PERP',
      direction: 'above',
      targetPrice: '100000',
      markPrice: '100500',
    });
    expect(title).not.toBe(TITLE);
    expect(body).not.toBe(BODY);
    expect(body).toMatch(/BTC-PERP/);
    expect(body).toMatch(/100000/);
  });
});
