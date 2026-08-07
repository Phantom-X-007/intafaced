import { describe, expect, it } from 'vitest';
import { emptyScene } from './scene.js';
import { decideHostSceneWrite, isHostSceneWriteConflict, isHostSceneWriteOk, sceneFingerprint } from './edit-policy.js';

describe('spatial concurrent host edit policy', () => {
  it('accepts first write without expectedFingerprint', () => {
    const current = emptyScene();
    const next = {
      version: 1 as const,
      stage: { width: 800, height: 600 },
      avatars: [{ id: 'a1', participantId: 'seat-1', position: { x: 10, y: 20 } }],
    };
    const r = decideHostSceneWrite({ current, next });
    expect(isHostSceneWriteOk(r)).toBe(true);
    if (r.ok) {
      expect(r.scene.avatars).toHaveLength(1);
      expect(r.fingerprint).toBe(sceneFingerprint(r.scene));
    }
  });

  it('accepts when expectedFingerprint matches current', () => {
    const current = {
      version: 1 as const,
      stage: { width: 100, height: 100 },
      avatars: [{ id: 'a1', participantId: 'seat-1', position: { x: 1, y: 1 } }],
    };
    const fp = sceneFingerprint(current);
    const next = {
      ...current,
      avatars: [{ id: 'a1', participantId: 'seat-1', position: { x: 50, y: 50 } }],
    };
    const r = decideHostSceneWrite({ current, next, expectedFingerprint: fp });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.scene.avatars![0]!.position).toEqual({ x: 50, y: 50 });
  });

  it('refuses stale fingerprint (concurrent host tab)', () => {
    const current = emptyScene();
    const r = decideHostSceneWrite({
      current,
      next: { version: 1 },
      expectedFingerprint: 'deadbeef'.repeat(8),
    });
    expect(r.ok).toBe(false);
    expect(isHostSceneWriteConflict(r)).toBe(true);
    if (!r.ok) expect(r.reason).toBe('conflict');
  });

  it('refuses invalid / oversized via parseScene', () => {
    const current = emptyScene();
    const bad = decideHostSceneWrite({ current, next: { version: 99 } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('invalid');
  });

  it('refuses duplicate participantId (presence invariant)', () => {
    const current = emptyScene();
    const r = decideHostSceneWrite({
      current,
      next: {
        version: 1,
        avatars: [
          { id: 'a1', participantId: 'seat-1', position: { x: 0, y: 0 } },
          { id: 'a2', participantId: 'seat-1', position: { x: 1, y: 1 } },
        ],
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('presence_collision');
      expect(r.message).toContain('seat-1');
    }
  });

  it('refuses duplicate avatar id', () => {
    const current = emptyScene();
    const r = decideHostSceneWrite({
      current,
      next: {
        version: 1,
        avatars: [
          { id: 'a1', participantId: 'seat-1', position: { x: 0, y: 0 } },
          { id: 'a1', participantId: 'seat-2', position: { x: 1, y: 1 } },
        ],
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('presence_collision');
  });

  it('fingerprint is stable for identical scenes', () => {
    const a = { version: 1 as const, stage: { width: 10, height: 10 } };
    const b = { version: 1 as const, stage: { width: 10, height: 10 } };
    expect(sceneFingerprint(a)).toBe(sceneFingerprint(b));
  });
});
