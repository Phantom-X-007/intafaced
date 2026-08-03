import { describe, expect, it } from 'vitest';
import { describeUnconfigured, haltBlockedReason, readConsoleStatus } from './console-status';

/**
 * The console's own answer to "what can I actually do right now?".
 *
 * Two properties are load-bearing and are asserted here rather than trusted:
 * the status must name the variable that is ACTUALLY missing (not both
 * candidates), and it must never carry a credential VALUE anywhere in its
 * output — the whole object is rendered into a banner on every page.
 */

const TOKEN = 'super-secret-operator-token-value';
const TREASURY = 'super-secret-treasury-token-value';

const env = (over: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({ ...over }) as NodeJS.ProcessEnv;

describe('readConsoleStatus — what this deployment can reach', () => {
  it('can halt nothing when nothing is set', () => {
    const s = readConsoleStatus(env());

    expect(s.canHaltAnything).toBe(false);
    expect(s.edgeUrl).toBeNull();
    expect(s.module.configured).toBe(false);
    expect(s.treasury.configured).toBe(false);
  });

  it('needs BOTH an address and a token — either alone halts nothing', () => {
    expect(readConsoleStatus(env({ EDGE_URL: 'http://edge:4000' })).canHaltAnything).toBe(false);
    expect(readConsoleStatus(env({ ADMIN_OPERATOR_TOKEN: TOKEN })).canHaltAnything).toBe(false);
  });

  /**
   * The authority split, which is the point of having two tokens. A console
   * holding only the module token can stop one market and CANNOT stop the money
   * plane. If this ever reports otherwise, an operator believes they have an
   * emergency stop they do not have.
   */
  it('separates halting a module from freezing the ledger', () => {
    const s = readConsoleStatus(env({ EDGE_URL: 'http://edge:4000', ADMIN_OPERATOR_TOKEN: TOKEN }));

    expect(s.module.configured).toBe(true);
    expect(s.treasury.configured).toBe(false);
    expect(s.canHaltAnything).toBe(true);
    expect(s.treasury.missing).toEqual(['ADMIN_TREASURY_TOKEN']);
  });

  it('is fully configured only when both tokens are present', () => {
    const s = readConsoleStatus(env({ EDGE_URL: 'http://edge:4000/', ADMIN_OPERATOR_TOKEN: TOKEN, ADMIN_TREASURY_TOKEN: TREASURY }));

    expect(s.module.configured).toBe(true);
    expect(s.treasury.configured).toBe(true);
    expect(s.missing).toEqual([]);
    expect(s.edgeUrl).toBe('http://edge:4000'); // trailing slash stripped
  });

  it('treats whitespace as unset — a variable set to spaces halts nothing', () => {
    const s = readConsoleStatus(env({ EDGE_URL: '  ', ADMIN_OPERATOR_TOKEN: '   ' }));

    expect(s.canHaltAnything).toBe(false);
    expect(s.module.missing).toEqual(['EDGE_URL', 'ADMIN_OPERATOR_TOKEN']);
  });

  it('deduplicates EDGE_URL across both authorities rather than naming it twice', () => {
    expect(readConsoleStatus(env()).missing).toEqual(['EDGE_URL', 'ADMIN_OPERATOR_TOKEN', 'ADMIN_TREASURY_TOKEN']);
  });

  /**
   * The regression this file exists for, on the credential side: this object is
   * rendered into a banner on EVERY page. If a token value ever reaches it, it
   * reaches the served HTML.
   */
  it('never carries a credential value — only names', () => {
    const s = readConsoleStatus(env({ EDGE_URL: 'http://edge:4000', ADMIN_OPERATOR_TOKEN: TOKEN, ADMIN_TREASURY_TOKEN: TREASURY }));
    const serialised = JSON.stringify(s);

    expect(serialised).not.toContain(TOKEN);
    expect(serialised).not.toContain(TREASURY);
  });
});

describe('describeUnconfigured — names what is actually missing', () => {
  /**
   * The old copy said "Set EDGE_URL and ADMIN_OPERATOR_TOKEN" even when
   * EDGE_URL was already correct, sending an operator to check a setting that
   * was never the problem.
   */
  it('names only the missing variable when the address is already set', () => {
    const s = readConsoleStatus(env({ EDGE_URL: 'http://edge:4000' }));
    const sentence = describeUnconfigured(s.treasury);

    expect(sentence).toContain('ADMIN_TREASURY_TOKEN');
    expect(sentence).not.toContain('EDGE_URL');
    expect(sentence).toContain('is not set');
  });

  it('names both, and reads as plural, when both are missing', () => {
    const sentence = describeUnconfigured(readConsoleStatus(env()).module);

    expect(sentence).toContain('EDGE_URL and ADMIN_OPERATOR_TOKEN');
    expect(sentence).toContain('are not set');
  });

  it('says what is lost in an operator’s vocabulary, not a variable’s', () => {
    expect(describeUnconfigured(readConsoleStatus(env()).treasury)).toContain('stop ALL value movement platform-wide');
    expect(describeUnconfigured(readConsoleStatus(env()).module)).toContain('stop new commitments on one market');
  });
});

describe('haltBlockedReason — the reason rendered beside a disabled control', () => {
  it('is null when the control may act', () => {
    const s = readConsoleStatus(env({ EDGE_URL: 'http://edge:4000', ADMIN_OPERATOR_TOKEN: TOKEN }));

    expect(haltBlockedReason(s.module)).toBeNull();
  });

  it('is a sentence, not a bare flag, when it may not', () => {
    const s = readConsoleStatus(env({ EDGE_URL: 'http://edge:4000', ADMIN_OPERATOR_TOKEN: TOKEN }));

    expect(haltBlockedReason(s.treasury)).toContain('ADMIN_TREASURY_TOKEN');
  });
});
