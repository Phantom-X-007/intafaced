/**
 * Video / LiveKit remains refuse-closed until SFU deploy + keys (product/infra).
 * Park residual: no invent CDN, no stub credential.
 */
import { describe, expect, it } from 'vitest';
import { isUsable, NullStreamProvider, streamProviderBoardCard, streamProviderStatusLine } from './provider.js';

describe('video / stream provider park (no invent SFU)', () => {
  it('NullStreamProvider is unusable and board card says so', () => {
    const p = new NullStreamProvider();
    expect(isUsable(p)).toBe(false);
    const card = streamProviderBoardCard(p);
    expect(card.usable).toBe(false);
    expect(card.isNull).toBe(true);
    expect(streamProviderStatusLine(p)).toMatch(/usable=0/);
    expect(streamProviderStatusLine(p)).toMatch(/null=1/);
  });

  it('join credential path refuses by name rather than inventing a token', async () => {
    const p = new NullStreamProvider();
    await expect(p.openRoom()).rejects.toThrow(/provider|configured|stream/i);
    await expect(p.credential({ sessionId: 'sess-1', streamRoom: 'r1', userId: 'u1', role: 'attendee' })).rejects.toThrow(
      /provider|configured|stream|lobby/i,
    );
  });
});
