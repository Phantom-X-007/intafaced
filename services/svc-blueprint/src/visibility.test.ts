import { describe, expect, it } from 'vitest';
import { mayViewCard } from './visibility.js';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MATE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STRANGER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('mayViewCard', () => {
  it('owner can always see their own card, including private', () => {
    expect(mayViewCard({ viewerId: OWNER, subjectUserId: OWNER, visibility: 'private', sameCrew: false })).toBe(true);
    expect(mayViewCard({ viewerId: OWNER, subjectUserId: OWNER, visibility: 'crew', sameCrew: false })).toBe(true);
    expect(mayViewCard({ viewerId: OWNER, subjectUserId: OWNER, visibility: 'public', sameCrew: false })).toBe(true);
  });

  it('private is invisible to everyone else', () => {
    expect(mayViewCard({ viewerId: MATE, subjectUserId: OWNER, visibility: 'private', sameCrew: true })).toBe(false);
    expect(mayViewCard({ viewerId: STRANGER, subjectUserId: OWNER, visibility: 'private', sameCrew: false })).toBe(false);
  });

  it('public is visible to any other authenticated viewer', () => {
    expect(mayViewCard({ viewerId: STRANGER, subjectUserId: OWNER, visibility: 'public', sameCrew: false })).toBe(true);
    expect(mayViewCard({ viewerId: MATE, subjectUserId: OWNER, visibility: 'public', sameCrew: true })).toBe(true);
  });

  it('crew is same-crew only', () => {
    expect(mayViewCard({ viewerId: MATE, subjectUserId: OWNER, visibility: 'crew', sameCrew: true })).toBe(true);
    expect(mayViewCard({ viewerId: STRANGER, subjectUserId: OWNER, visibility: 'crew', sameCrew: false })).toBe(false);
  });
});
