import { describe, expect, it } from 'vitest';
import { resolveBundler } from './bundler-policy.js';

describe('bundler policy (S-A11)', () => {
  it('defaults safe path: user submits when no URL', () => {
    const r = resolveBundler({
      mode: 'public_bundler',
      bundlerUrl: null,
      fallbackToUserSubmit: true,
    });
    expect(r.submitVia).toBe('user');
    expect(r.failureMode).toMatch(/falling back/i);
  });

  it('states censor/reorder failure mode for public bundler', () => {
    const r = resolveBundler({
      mode: 'public_bundler',
      bundlerUrl: 'https://bundler.example',
      fallbackToUserSubmit: true,
    });
    expect(r.submitVia).toBe('bundler');
    expect(r.failureMode).toMatch(/censor|reorder/i);
  });
});
