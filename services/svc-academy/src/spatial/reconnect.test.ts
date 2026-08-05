import { describe, expect, it } from 'vitest';
import { restoreSceneOnReconnect } from './reconnect.js';

describe('spatial L3 reconnect restore', () => {
  const server = {
    version: 1 as const,
    stage: { width: 100, height: 100 },
    avatars: [{ id: 'a1', participantId: 'p1', position: { x: 1, y: 2 } }],
  };
  const local = {
    version: 1 as const,
    stage: { width: 50, height: 50 },
    avatars: [{ id: 'ghost', participantId: 'g', position: { x: 9, y: 9 } }],
  };

  it('prefers valid server over local draft', () => {
    const r = restoreSceneOnReconnect({ serverScene: server, localDraft: local });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.source).toBe('server');
    expect(r.scene.avatars![0]!.id).toBe('a1');
  });

  it('uses local draft only when server missing', () => {
    const r = restoreSceneOnReconnect({ serverScene: null, localDraft: local });
    expect(r).toMatchObject({ status: 'ok', source: 'local_draft' });
  });

  it('empty default when both missing — no invent avatars', () => {
    const r = restoreSceneOnReconnect({ serverScene: null, localDraft: null });
    expect(r).toMatchObject({ status: 'ok', source: 'empty_default' });
    if (r.status === 'ok') {
      expect(r.scene).toEqual({ version: 1 });
      expect(r.scene.avatars).toBeUndefined();
    }
  });

  it('invalid server refuses — does not fall back to local invent', () => {
    const r = restoreSceneOnReconnect({ serverScene: { version: 99 }, localDraft: local });
    expect(r.status).toBe('refuse');
    if (r.status === 'refuse') expect(r.reason).toBe('server_invalid');
  });
});
