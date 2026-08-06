import { describe, expect, it } from 'vitest';
import {
  smsComposeBoardCard,
  smsComposeStatusLine,
  parseSmsComposeStatusLine,
  smsComposeStatusLineMatches,
  smsComposeStatusLineConsistent,
  smsComposeExportHeader,
  smsComposeExportLine,
  smsComposeExportText,
  smsLengthInRange,
  smsWithinBudget,
} from './sms-honesty.js';

describe('L3 wave56 sms compose honesty boards', () => {
  it('fits and over-budget boards', () => {
    const fit = 'Filled: buy 1 at 2';
    expect(smsComposeBoardCard(fit, 480).withinBudget).toBe(true);
    expect(smsComposeBoardCard(fit, 480).empty).toBe(false);
    expect(smsComposeStatusLineMatches(fit, 480)).toBe(true);
    expect(smsComposeStatusLineConsistent(smsComposeStatusLine(fit, 480))).toBe(true);
    expect(parseSmsComposeStatusLine('nope')).toBeNull();
    expect(smsComposeExportText(fit, 480).startsWith(smsComposeExportHeader())).toBe(true);
    expect(smsWithinBudget(fit, 480)).toBe(true);
    expect(smsWithinBudget(fit, Number.NaN)).toBe(false);
    expect(smsLengthInRange(fit, 1, 100)).toBe(true);
    expect(smsLengthInRange(fit, 100, 1)).toBe(false);

    const cut = 'A'.repeat(60) + '…';
    expect(smsComposeBoardCard(cut, 64).truncated).toBe(true);
    expect(smsComposeStatusLineMatches(cut, 64)).toBe(true);
    expect(smsComposeExportLine(cut, 64)).toContain('1');

    expect(smsComposeBoardCard('', 10).empty).toBe(true);
    expect(smsComposeStatusLineMatches('', 10)).toBe(true);
  });
});
