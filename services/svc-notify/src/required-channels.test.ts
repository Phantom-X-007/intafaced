import { describe, expect, it } from 'vitest';
import { fanoutReadiness, missingRequiredCredentials, parseRequiredChannels } from './required-channels.js';

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

  it('L3 fanoutReadiness refuses missing required creds', () => {
    expect(
      fanoutReadiness({
        requiredRaw: 'email,push',
        appEnv: 'staging',
        present: { email: true, push: false, sms: false },
      }),
    ).toMatchObject({ ok: false, missing: ['push'] });
    expect(
      fanoutReadiness({
        requiredRaw: 'none',
        appEnv: 'production',
        present: { email: false, push: false, sms: false },
      }),
    ).toEqual({ ok: true, config: { mode: 'none' } });
  });
});
