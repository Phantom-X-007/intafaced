import { describe, expect, it } from 'vitest';
import { userCopy } from './user-copy.js';

/**
 * Unit card — user-visible ledger copy resolves @intafaced/i18n keys
 * 1. Promise: TRK-infra.i18n slice — posting / freeze / recipe refuse strings
 * 2. Break: unknown key invents English instead of echoing the dotted name
 * 3. Done bar: known key renders catalog copy; unknown key === key string
 * 4. Class N
 * 5. Paths: services/svc-ledger + packages/i18n consumer pin (do not edit catalog)
 * 6. RED: unknown key becomes a sentence
 * 7. Collision: none vs svc-token / packages/i18n catalog
 */
describe('userCopy — catalog keys, never invented English', () => {
  it('resolves a known catalog key from @intafaced/i18n', () => {
    expect(userCopy('error.insufficientFunds')).toBe('Insufficient balance.');
    expect(userCopy('ledger.insufficient_funds')).toBe('Insufficient balance.');
    expect(userCopy('ledger.unauthenticated')).toBe('Sign in to continue.');
    expect(userCopy('error.generic')).toBe('Something went wrong. Try again.');
    expect(userCopy('error.forbidden')).toBe('You do not have access to this.');
  });

  it('renders the dotted key when the key is not in the catalog', () => {
    const missing = 'ledger.posting.this.key.does.not.exist';
    const rendered = userCopy(missing);

    expect(rendered).toBe(missing);
    expect(rendered).not.toMatch(/ /);
    expect(rendered).not.toMatch(/please try|something went wrong|could not find|insufficient|frozen/i);
  });

  it('does not invent freeze or recipe copy for unkeyed refuse codes', () => {
    const frozen = userCopy('ledger.frozen');
    expect(frozen).toBe('ledger.frozen');
    expect(frozen).not.toMatch(/ /);
    expect(frozen).not.toMatch(/posting is frozen|reconciliation|operator freeze/i);

    const attributed = userCopy('ledger.freeze_attributed');
    expect(attributed).toBe('ledger.freeze_attributed');
    expect(attributed).not.toMatch(/ /);
    expect(attributed).not.toMatch(/already frozen|refusing to overwrite/i);

    const recipe = userCopy('ledger.invalid_entry');
    expect(recipe).toBe('ledger.invalid_entry');
    expect(recipe).not.toMatch(/ /);
    expect(recipe).not.toMatch(/must be positive|fee exceeds|recipe/i);
  });
});
