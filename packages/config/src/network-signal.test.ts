import { describe, expect, it } from 'vitest';
import {
  NETWORK_SIGNAL_CONFIGURED_ENV,
  NETWORK_SIGNAL_FAIL_CLOSED_ENV,
  checkNetworkAccess,
  networkPartnerConfigured,
  networkSignalFailClosed,
  networkSignalStatusLine,
  resolveNetworkSignal,
} from './network-signal.js';

/**
 * Unit card (L16 W9)
 * Promise: docs/ops/trk/ops.compliance.md — VPN/Tor is real signal or explicit residual; no fake certainty.
 * Break on tip: no mechanism → omission reads as "clear".
 * Done bar: unset ≠ clear; dark ≠ clear; fail-closed refuses unset/dark; forged clear without partner is unset.
 * Class N · packages/config only · no partner invent · no Class X list content.
 */

describe('partner configured claim', () => {
  it('is false when env is absent', () => {
    expect(networkPartnerConfigured({})).toBe(false);
  });

  it('is true only for explicit truthy values', () => {
    expect(networkPartnerConfigured({ [NETWORK_SIGNAL_CONFIGURED_ENV]: '1' })).toBe(true);
    expect(networkPartnerConfigured({ [NETWORK_SIGNAL_CONFIGURED_ENV]: 'true' })).toBe(true);
    expect(networkPartnerConfigured({ [NETWORK_SIGNAL_CONFIGURED_ENV]: '0' })).toBe(false);
    expect(networkPartnerConfigured({ [NETWORK_SIGNAL_CONFIGURED_ENV]: 'maybe' })).toBe(false);
  });
});

describe('resolveNetworkSignal — honesty axis', () => {
  it('unset when partner not configured — not clear', () => {
    const s = resolveNetworkSignal({});
    expect(s.declaration).toBe('unset');
    expect(s.declaration).not.toBe('clear');
    expect(s.partnerConfigured).toBe(false);
    expect(s.summary).toContain('NOT CONFIGURED');
    // Summary may say "not clear" in plain language — the declaration is the machine fact.
    expect(s.summary).toContain('not "the path is clear"');
  });

  it('a forged clear observation without a partner stays unset', () => {
    // Hostile caller: adapter claims clear while slot is off.
    const s = resolveNetworkSignal({}, { result: 'clear', source: 'forged-probe' });
    expect(s.declaration).toBe('unset');
    expect(s.partnerConfigured).toBe(false);
    expect(s.declaration).not.toBe('clear');
  });

  it('a forged flagged observation without a partner stays unset (no free refuse theater)', () => {
    const s = resolveNetworkSignal({}, { result: 'flagged', kind: 'vpn' });
    expect(s.declaration).toBe('unset');
  });

  it('partner configured + no observation → dark, not clear', () => {
    const s = resolveNetworkSignal({ [NETWORK_SIGNAL_CONFIGURED_ENV]: '1' });
    expect(s.declaration).toBe('dark');
    expect(s.partnerConfigured).toBe(true);
    expect(s.summary).toContain('DARK');
  });

  it('partner configured + probe error → dark', () => {
    const s = resolveNetworkSignal({ [NETWORK_SIGNAL_CONFIGURED_ENV]: '1' }, { result: 'error', source: 'probe-timeout' });
    expect(s.declaration).toBe('dark');
    expect(s.summary).toContain('DARK');
  });

  it('partner configured + clear observation → clear', () => {
    const s = resolveNetworkSignal({ [NETWORK_SIGNAL_CONFIGURED_ENV]: '1' }, { result: 'clear', source: 'probe-1' });
    expect(s.declaration).toBe('clear');
    expect(s.kind).toBe('none');
    expect(s.summary).toContain('CLEAR');
  });

  it('partner configured + flagged observation → flagged with kind', () => {
    const s = resolveNetworkSignal(
      { [NETWORK_SIGNAL_CONFIGURED_ENV]: '1' },
      { result: 'flagged', kind: 'tor', source: 'probe-2' },
    );
    expect(s.declaration).toBe('flagged');
    expect(s.kind).toBe('tor');
  });
});

describe('checkNetworkAccess — fail-closed', () => {
  it('allows unset when fail-closed is off (local frictionless) but status stays unset', () => {
    const d = checkNetworkAccess({});
    expect(d.allowed).toBe(true);
    expect(d.code).toBe('allowed.network');
    expect(d.signal.declaration).toBe('unset');
  });

  it('refuses unset when fail-closed is armed', () => {
    const d = checkNetworkAccess({
      [NETWORK_SIGNAL_FAIL_CLOSED_ENV]: '1',
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('denied.network_unconfigured');
  });

  it('refuses dark when fail-closed is armed', () => {
    const d = checkNetworkAccess(
      {
        [NETWORK_SIGNAL_CONFIGURED_ENV]: '1',
        [NETWORK_SIGNAL_FAIL_CLOSED_ENV]: 'true',
      },
      { result: 'error' },
    );
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('denied.network_dark');
  });

  it('always refuses flagged, even with fail-closed off', () => {
    const d = checkNetworkAccess({ [NETWORK_SIGNAL_CONFIGURED_ENV]: '1' }, { result: 'flagged', kind: 'vpn' });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('denied.network_flagged');
  });

  it('allows clear when partner is real', () => {
    const d = checkNetworkAccess({ [NETWORK_SIGNAL_CONFIGURED_ENV]: '1' }, { result: 'clear', source: 'ok' });
    expect(d.allowed).toBe(true);
    expect(d.signal.declaration).toBe('clear');
  });
});

describe('status line', () => {
  it('encodes declaration and partner bit without inventing clear', () => {
    expect(networkSignalStatusLine({})).toBe('network_signal=unset partner=0 fail_closed=0 kind=none');
    expect(
      networkSignalStatusLine({ [NETWORK_SIGNAL_CONFIGURED_ENV]: '1', [NETWORK_SIGNAL_FAIL_CLOSED_ENV]: '1' }),
    ).toBe('network_signal=dark partner=1 fail_closed=1 kind=unknown');
  });
});

describe('fail-closed env parser', () => {
  it('defaults off', () => {
    expect(networkSignalFailClosed({})).toBe(false);
  });
});
