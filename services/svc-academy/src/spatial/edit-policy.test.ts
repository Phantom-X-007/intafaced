import { describe, expect, it } from 'vitest';
import { emptyScene, SCENE_MAX_BYTES } from './scene.js';
import {
  HOST_SCENE_REFUSE,
  decideHostSceneWrite,
  hasExpectedFingerprint,
  hostSceneWriteRefuseName,
  isHostSceneWriteConflict,
  isHostSceneWriteOk,
  sceneFingerprint,
  sceneRequiresHostFingerprint,
} from './edit-policy.js';

describe('spatial concurrent host edit policy', () => {
  it('accepts first write without expectedFingerprint', () => {
    const current = emptyScene();
    expect(sceneRequiresHostFingerprint(current)).toBe(false);
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
    expect(sceneRequiresHostFingerprint(current)).toBe(true);
    const fp = sceneFingerprint(current);
    const next = {
      ...current,
      avatars: [{ id: 'a1', participantId: 'seat-1', position: { x: 50, y: 50 } }],
    };
    const r = decideHostSceneWrite({ current, next, expectedFingerprint: fp });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.scene.avatars![0]!.position).toEqual({ x: 50, y: 50 });
  });

  it('refuses omit fingerprint when current scene is non-empty (D26-P1-C6)', () => {
    const current = {
      version: 1 as const,
      stage: { width: 100, height: 100 },
      avatars: [{ id: 'a1', participantId: 'seat-1', position: { x: 1, y: 1 } }],
    };
    const r = decideHostSceneWrite({
      current,
      next: {
        ...current,
        avatars: [{ id: 'a1', participantId: 'seat-1', position: { x: 9, y: 9 } }],
      },
    });
    expect(r.ok).toBe(false);
    expect(isHostSceneWriteConflict(r)).toBe(true);
    expect(hostSceneWriteRefuseName(r)).toBe(HOST_SCENE_REFUSE.fingerprint_required);
    if (!r.ok) {
      expect(r.reason).toBe('conflict');
      expect(r.message).toContain('fingerprint required');
      if (r.reason === 'conflict') expect(r.name).toBe('fingerprint_required');
    }
  });

  it('refuses blank fingerprint as required (not silent overwrite)', () => {
    const current = {
      version: 1 as const,
      stage: { width: 100, height: 100 },
    };
    expect(hasExpectedFingerprint('   ')).toBe(false);
    const r = decideHostSceneWrite({
      current,
      next: { version: 1, stage: { width: 200, height: 200 } },
      expectedFingerprint: '   ',
    });
    expect(hostSceneWriteRefuseName(r)).toBe(HOST_SCENE_REFUSE.fingerprint_required);
  });

  it('refuses omit fingerprint when only props make scene non-empty', () => {
    const current = {
      version: 1 as const,
      props: [{ id: 'p1', kind: 'desk', position: { x: 0, y: 0 } }],
    };
    expect(sceneRequiresHostFingerprint(current)).toBe(true);
    const r = decideHostSceneWrite({ current, next: { version: 1 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('conflict');
    expect(hostSceneWriteRefuseName(r)).toBe(HOST_SCENE_REFUSE.fingerprint_required);
  });

  it('refuses stale fingerprint (concurrent host tab) by name', () => {
    const current = emptyScene();
    const r = decideHostSceneWrite({
      current,
      next: { version: 1 },
      expectedFingerprint: 'deadbeef'.repeat(8),
    });
    expect(r.ok).toBe(false);
    expect(isHostSceneWriteConflict(r)).toBe(true);
    expect(hostSceneWriteRefuseName(r)).toBe(HOST_SCENE_REFUSE.fingerprint_mismatch);
    if (!r.ok) expect(r.reason).toBe('conflict');
  });

  it('refuses invalid / oversized via parseScene', () => {
    const current = emptyScene();
    const bad = decideHostSceneWrite({ current, next: { version: 99 } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('invalid');
    expect(hostSceneWriteRefuseName(bad)).toBeNull();

    const huge = {
      version: 1 as const,
      props: [] as { id: string; kind: string; position: { x: number; y: number } }[],
    };
    let i = 0;
    while (Buffer.byteLength(JSON.stringify(huge), 'utf8') <= SCENE_MAX_BYTES) {
      huge.props.push({ id: `p${i}`, kind: 'block', position: { x: i, y: i } });
      i += 1;
      if (i > 50_000) break;
    }
    const over = decideHostSceneWrite({ current, next: huge });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toBe('oversized');
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
