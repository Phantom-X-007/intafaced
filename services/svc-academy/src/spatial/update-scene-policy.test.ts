/**
 * updateScene hot path must use decideHostSceneWrite — not assertScene alone.
 * These cases mirror the residual that last-write-wins multi-tab used to allow.
 */
import { describe, expect, it } from 'vitest';
import { emptyScene, parseScene } from './scene.js';
import { decideHostSceneWrite, sceneFingerprint } from './edit-policy.js';

describe('updateScene concurrent edit policy (wired residual)', () => {
  it('stale fingerprint refuses without inventing a merge', () => {
    const current = emptyScene();
    const next = { version: 1 as const, stage: { width: 10, height: 10 } };
    const fp = sceneFingerprint(current);
    const stale = decideHostSceneWrite({
      current,
      next,
      expectedFingerprint: '0'.repeat(64),
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.reason).toBe('conflict');

    const ok = decideHostSceneWrite({ current, next, expectedFingerprint: fp });
    expect(ok.ok).toBe(true);
  });

  it('duplicate participantId is presence_collision (not silent last-write)', () => {
    const current = emptyScene();
    const next = {
      version: 1 as const,
      avatars: [
        { id: 'a1', participantId: 'p1', position: { x: 0, y: 0 } },
        { id: 'a2', participantId: 'p1', position: { x: 1, y: 1 } },
      ],
    };
    const d = decideHostSceneWrite({ current, next });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toBe('presence_collision');
  });

  it('unreadable server scene {} normalises to empty v1 before decide', () => {
    const parsed = parseScene({});
    expect(parsed.ok).toBe(false);
    const current = emptyScene();
    const d = decideHostSceneWrite({
      current,
      next: { version: 1 },
    });
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.scene.version).toBe(1);
  });
});
