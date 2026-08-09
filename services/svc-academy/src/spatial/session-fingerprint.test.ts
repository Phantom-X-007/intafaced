/**
 * Session read must expose the same fingerprint host writes check against.
 * Without it, expectedFingerprint is unusable after load/reconnect.
 */
import { describe, expect, it } from 'vitest';
import { decideHostSceneWrite, sceneFingerprint } from './edit-policy.js';
import { emptyScene, parseScene } from './scene.js';

/** Mirrors academy-service toSession fingerprint SoT. */
function fingerprintFromStoredScene(scene: Record<string, unknown>): string {
  const parsed = parseScene(scene);
  const s = parsed.ok ? parsed.scene : emptyScene();
  return sceneFingerprint(s);
}

describe('session sceneFingerprint honesty (read token)', () => {
  it('empty / {} storage yields emptyScene fingerprint', () => {
    const fpEmpty = sceneFingerprint(emptyScene());
    expect(fingerprintFromStoredScene({})).toBe(fpEmpty);
    expect(fingerprintFromStoredScene({ version: 1 })).toBe(fpEmpty);
  });

  it('read fingerprint matches decideHostSceneWrite expectedFingerprint gate', () => {
    const next = {
      version: 1 as const,
      stage: { width: 20, height: 20 },
      avatars: [{ id: 'a1', participantId: 'p1', position: { x: 1, y: 2 } }],
    };
    const d = decideHostSceneWrite({ current: emptyScene(), next });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    // Client would store this as session.scene after write; re-read must match.
    const stored = d.scene as unknown as Record<string, unknown>;
    expect(fingerprintFromStoredScene(stored)).toBe(d.fingerprint);
    // Stale host with wrong token conflicts
    const conflict = decideHostSceneWrite({
      current: d.scene,
      next: { ...next, stage: { width: 30, height: 30 } },
      expectedFingerprint: 'deadbeef',
    });
    expect(conflict.ok).toBe(false);
    if (conflict.ok) return;
    expect(conflict.reason).toBe('conflict');
    // Correct token from read path accepts
    const ok = decideHostSceneWrite({
      current: d.scene,
      next: { ...next, stage: { width: 30, height: 30 } },
      expectedFingerprint: fingerprintFromStoredScene(stored),
    });
    expect(ok.ok).toBe(true);
  });
});
