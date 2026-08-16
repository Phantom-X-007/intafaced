/**
 * Unit card — svc-bank user-visible copy resolves @intafaced/i18n keys
 * 1. Promise: TRK-infra.i18n slice — ramp/card refusal strings go through the catalog
 * 2. Break: unknown key invents English ("No bank ramp programme") instead of the dotted name
 * 3. Done bar: known tip keys render catalog copy; unknown keys return the dotted key
 * 4. Class N
 * 5. Paths: services/svc-bank only (catalog keys already on tip; packages/i18n catalog untouched)
 * 6. RED: unknown key becomes a sentence
 * 7. Collision: none vs packages/i18n catalog / svc-pay / apps/admin
 */

import { describe, expect, it } from 'vitest';
import { userCopy, userFacingBankMessage } from './user-copy.js';

const UNKNOWN_RAMP = 'bank.no_ramp_rail';
const UNKNOWN_CARD = 'bank.no_card_issuer';
const UNKNOWN_MADE_UP = 'bank.this.key.does.not.exist';

describe('user-visible bank copy — @intafaced/i18n (TRK-infra.i18n slice)', () => {
  it('resolves a known tip catalog key (never a second English table)', () => {
    expect(userCopy('error.insufficientFunds')).toBe('Insufficient balance.');
    expect(userCopy('error.validation.invalidAmount')).toBe('Enter a valid amount.');
  });

  it('refuses an unknown key by name instead of inventing English copy', () => {
    expect(userCopy(UNKNOWN_RAMP)).toBe(UNKNOWN_RAMP);
    expect(userCopy(UNKNOWN_CARD)).toBe(UNKNOWN_CARD);
    expect(userCopy(UNKNOWN_MADE_UP)).toBe(UNKNOWN_MADE_UP);

    expect(userCopy(UNKNOWN_RAMP)).not.toMatch(/No bank ramp programme/i);
    expect(userCopy(UNKNOWN_CARD)).not.toMatch(/No card issuer/i);
    expect(userCopy(UNKNOWN_MADE_UP)).not.toMatch(/ /);
  });

  it('ramp/card wire messages use the catalog path, not the operator sentence', () => {
    expect(userFacingBankMessage('bank.no_ramp_rail', 'No bank ramp programme is configured')).toBe('bank.no_ramp_rail');
    expect(userFacingBankMessage('bank.fiat_ramp_socket', 'Fiat on/off ramp is socket.psp-partners')).toBe('bank.fiat_ramp_socket');
    expect(userFacingBankMessage('bank.no_fiat_rail', 'No live fiat rail on the pay adapter')).toBe('bank.no_fiat_rail');
    expect(userFacingBankMessage('bank.no_card_issuer', 'No card issuer is configured')).toBe('bank.no_card_issuer');
    // Spaces stay operator English — not a user-visible i18n slice in this PR.
    expect(userFacingBankMessage('bank.space_not_found', 'Space abc not found')).toBe('Space abc not found');
  });
});
