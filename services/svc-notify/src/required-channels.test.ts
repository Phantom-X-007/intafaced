import { describe, expect, it } from 'vitest';
import { missingRequiredCredentials, parseRequiredChannels } from './required-channels.js';

describe('notify L3 required channels honesty', () => {
  it('prod refuses empty declaration', () => {
    expect(parseRequiredChannels(undefined, 'production').ok).toBe(false);
  });

  it('none is explicit ok', () => {
    expect(parseRequiredChannels('none', 'production')).toEqual({ ok: true, config: { mode: 'none' } });
  });

  it('lists missing credentials without inventing presence', () => {
    const p = parseRequiredChannels('email,sms', 'staging');
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(missingRequiredCredentials(p.config, { email: true, push: false, sms: false })).toEqual(['sms']);
  });
});
