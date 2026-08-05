import { describe, expect, it } from 'vitest';
import { emptyScene } from './scene.js';
import { clampToStage, ensureStage, listPresence, moveAvatar, CanvasError } from './canvas.js';

describe('spatial Stage-2 2D canvas', () => {
  it('ensureStage adds default dimensions', () => {
    const s = ensureStage(emptyScene());
    expect(s.stage).toEqual({ width: 1000, height: 1000 });
  });

  it('moveAvatar clamps to stage; missing avatar refuses invent', () => {
    let s = ensureStage(emptyScene());
    s = {
      ...s,
      avatars: [{ id: 'a1', participantId: 'p1', position: { x: 10, y: 10 } }],
    };
    const moved = moveAvatar(s, { avatarId: 'a1', dx: 5000, dy: -5 });
    expect(moved.avatars![0]!.position).toEqual({ x: 1000, y: 5 });
    expect(() => moveAvatar(s, { avatarId: 'ghost', dx: 1, dy: 1 })).toThrow(CanvasError);
  });

  it('listPresence is id-only', () => {
    const s = {
      version: 1 as const,
      stage: { width: 100, height: 100 },
      avatars: [{ id: 'a1', participantId: 'seat-9', position: { x: 1, y: 2 } }],
    };
    expect(listPresence(s)).toEqual([{ avatarId: 'a1', participantId: 'seat-9', x: 1, y: 2 }]);
  });

  it('clampToStage uses stage bounds', () => {
    const s = ensureStage(emptyScene(), { width: 50, height: 40 });
    expect(clampToStage(s, -1, 99)).toEqual({ x: 0, y: 40 });
  });
});
