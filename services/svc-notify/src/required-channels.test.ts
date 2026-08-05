import { describe, expect, it } from 'vitest';
import {
  fanoutReadiness,
  missingRequiredCredentials,
  parseRequiredChannels,
  requiredChannelCount,
  allOutOfAppChannels,
  isRequiredChannelsNone,
  isRequiredChannelsList,
  presentOutOfAppChannels,
  absentOutOfAppChannels,
  fanoutReadinessBoardCard,
  credentialPresenceExportLines,
  credentialPresenceExportHeader,
} from './required-channels.js';

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

  it('L3 requiredChannelCount is zero for mode none', () => {
    expect(requiredChannelCount({ mode: 'none' })).toBe(0);
    expect(requiredChannelCount({ mode: 'list', channels: ['email', 'push'] })).toBe(2);
  });

  it('L3 wave44 required channels board helpers', () => {
    expect(allOutOfAppChannels()).toEqual(['email', 'push', 'sms']);
    expect(isRequiredChannelsNone({ mode: 'none' })).toBe(true);
    expect(isRequiredChannelsList({ mode: 'list', channels: ['email'] })).toBe(true);
    const present = { email: true, push: false, sms: false };
    expect(presentOutOfAppChannels(present)).toEqual(['email']);
    expect(absentOutOfAppChannels(present)).toEqual(['push', 'sms']);
    expect(credentialPresenceExportHeader()).toBe('channel,present');
    expect(credentialPresenceExportLines(present)).toContain('email,1');
    const card = fanoutReadinessBoardCard({ requiredRaw: undefined, appEnv: 'test', present });
    expect(typeof card.ready).toBe('boolean');
    expect(card.presentCount).toBe(1);
  });
});
