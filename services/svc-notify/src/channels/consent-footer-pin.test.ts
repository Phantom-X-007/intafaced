/**
 * Unit card — out-of-app bodies carry consent footer; verification does not
 * 1. Promise: README Consent footer — renderNotification appends
 *    notify.channel.footer; renderVerification does not (unconfirmed address)
 * 2. Break: drop footer → outbound copy leaves platform without opt-out line;
 *    add footer on verify → "you confirmed this address" is a lie
 * 3. Done bar: notification body ends with footer text; verify footer is null
 *    and body does not contain the footer catalog string
 * 4. Class N
 * 5. Paths: services/svc-notify/**
 * 6. RED pin
 * 7. Collision: none
 */

import { describe, expect, it } from 'vitest';
import { createTranslator } from '@intafaced/i18n';
import { renderNotification, renderVerification } from './render.js';
import type { Notification } from '../store.js';

const NOTIFICATION: Notification = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  kind: 'bank.margin_call',
  titleKey: 'notify.bank.margin_call.title',
  bodyKey: 'notify.bank.margin_call.body',
  params: {
    cureCollateralAmount: '0.1',
    collateralAssetId: 'BTC',
    graceExpiresAt: '2026-08-10T00:00:00.000Z',
  },
  href: null,
  severity: 'critical',
  sourceSubject: 'intafaced.bank.margin_call.created',
  sourceIdempotencyKey: 'loan:1',
  createdAt: new Date('2026-08-09T00:00:00.000Z'),
  readAt: null,
};

describe('consent footer pin', () => {
  it('renderNotification appends the catalog footer after the body', () => {
    const footer = createTranslator('en').t('notify.channel.footer');
    expect(footer.length).toBeGreaterThan(10);

    const rendered = renderNotification(NOTIFICATION, 'en');
    expect(rendered.footer).toBe(footer);
    expect(rendered.body.endsWith(footer)).toBe(true);
    expect(rendered.body).toContain('\n\n');
    // Core fact still present — footer is append-only, not a replace.
    expect(rendered.body.startsWith(footer)).toBe(false);
  });

  it('renderVerification never claims consent on an unconfirmed address', () => {
    const footer = createTranslator('en').t('notify.channel.footer');
    const rendered = renderVerification('en', '123456', 15);
    expect(rendered.footer).toBeNull();
    expect(rendered.body).not.toContain(footer);
    expect(rendered.body).toMatch(/123456/);
  });
});
