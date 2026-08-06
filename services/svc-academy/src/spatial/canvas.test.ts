import { describe, expect, it } from 'vitest';
import { emptyScene } from './scene.js';
import {
  clampToStage,
  ensureStage,
  listPresence,
  moveAvatar,
  placeAvatar,
  placeProp,
  removeAvatar,
  removeProp,
  CanvasError,
  presenceCount,
  hasPresence,
  canvasBoardCard,
  canvasStatusLine,
  canvasStatusLineIsEmpty,
  parseCanvasStatusLine,
  canvasStatusLineMatches,
  canvasExportHeader,
  canvasExportLine,
  canvasExportText,
  presenceCountInRange,
  isPointOnStage,
} from './canvas.js';

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

  it('placeAvatar + removeAvatar host path; duplicate/missing refuse', () => {
    let s = ensureStage(emptyScene(), { width: 100, height: 100 });
    s = placeAvatar(s, { avatarId: 'a1', participantId: 'seat-1', x: 200, y: -5 });
    expect(s.avatars).toHaveLength(1);
    expect(s.avatars![0]!.position).toEqual({ x: 100, y: 0 });
    expect(() => placeAvatar(s, { avatarId: 'a1', participantId: 'seat-2', x: 1, y: 1 })).toThrow(CanvasError);
    s = removeAvatar(s, 'a1');
    expect(s.avatars).toEqual([]);
    expect(() => removeAvatar(s, 'a1')).toThrow(CanvasError);
  });

  it('placeProp + removeProp host path; duplicate/missing refuse', () => {
    let s = ensureStage(emptyScene());
    s = placeProp(s, { propId: 'p1', kind: 'desk', x: 10, y: 20 });
    expect(s.props).toHaveLength(1);
    expect(s.props![0]!.kind).toBe('desk');
    expect(() => placeProp(s, { propId: 'p1', kind: 'chair', x: 0, y: 0 })).toThrow(CanvasError);
    s = removeProp(s, 'p1');
    expect(s.props).toEqual([]);
    expect(() => removeProp(s, 'p1')).toThrow(CanvasError);
  });
});

describe('L3 wave49 canvas status/export', () => {
  it('presence and status honesty', () => {
    let s = ensureStage(emptyScene());
    expect(canvasStatusLineIsEmpty(s)).toBe(true);
    expect(hasPresence(s)).toBe(false);
    expect(presenceCount(s)).toBe(0);
    expect(canvasStatusLineMatches(s)).toBe(true);
    expect(parseCanvasStatusLine('nope')).toBeNull();
    expect(canvasExportText(s).startsWith(canvasExportHeader())).toBe(true);
    expect(isPointOnStage(s, 0, 0)).toBe(true);
    expect(isPointOnStage(s, -1, 0)).toBe(false);
    expect(isPointOnStage(s, Number.NaN, 0)).toBe(false);
    s = placeAvatar(s, { avatarId: 'a1', participantId: 'seat-1', x: 10, y: 10 });
    expect(presenceCount(s)).toBe(1);
    expect(hasPresence(s)).toBe(true);
    expect(canvasBoardCard(s).presence).toBe(1);
    expect(canvasStatusLine(s)).toContain('presence=1');
    expect(canvasStatusLineMatches(s)).toBe(true);
    expect(presenceCountInRange(s, 1, 2)).toBe(true);
    expect(presenceCountInRange(s, 2, 1)).toBe(false);
    expect(canvasExportLine(s)).toContain('1,0,');
  });
});
