import { describe, expect, it } from 'vitest';
import { userCopy } from './user-copy.js';

/**
 * Unit card — user-visible academy copy resolves @intafaced/i18n keys
 * 1. Promise: TRK-infra.i18n slice — curriculum / cert / lobby refuse strings
 * 2. Break: unknown key invents English instead of echoing the dotted name
 * 3. Done bar: known key renders catalog copy; unknown key === key string
 * 4. Class N
 * 5. Paths: services/svc-academy only (do not edit packages/i18n catalog)
 * 6. RED: unknown key becomes a sentence
 * 7. Collision: none vs svc-market / svc-pay / packages/i18n catalog
 */
describe('userCopy — catalog keys, never invented English', () => {
  it('resolves a known catalog key from @intafaced/i18n', () => {
    expect(userCopy('error.notFound')).toBe('We could not find that.');
    expect(userCopy('academy.curriculum_not_found')).toBe('We could not find that.');
    expect(userCopy('academy.cert_not_found')).toBe('We could not find that.');
    expect(userCopy('academy.room_not_found')).toBe('We could not find that.');
    expect(userCopy('academy.invite_required')).toBe('You do not have access to this.');
  });

  it('renders the dotted key when the key is not in the catalog', () => {
    const missing = 'academy.lobby.this.key.does.not.exist';
    const rendered = userCopy(missing);

    expect(rendered).toBe(missing);
    expect(rendered).not.toMatch(/ /);
    expect(rendered).not.toMatch(/please try|something went wrong|could not find/i);
  });

  it('does not invent perk or IFC copy for a blank-rate refuse code', () => {
    const rendered = userCopy('academy.cert_perk_refuse_closed');
    expect(rendered).toBe('academy.cert_perk_refuse_closed');
    expect(rendered).not.toMatch(/\d/);
    expect(rendered).not.toMatch(/ /);
    expect(rendered).not.toMatch(/free perk|0 bps|zero ifc|granted xp/i);
  });

  it('unset video URL TTL copy is the dotted code — never invents 300 seconds', () => {
    const rendered = userCopy('academy.video_url_ttl_unset');
    expect(rendered).toBe('academy.video_url_ttl_unset');
    expect(rendered).not.toMatch(/300/);
    expect(rendered).not.toMatch(/ /);
  });
});
