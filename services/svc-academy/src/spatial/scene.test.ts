import { describe, expect, it } from 'vitest';
import { AcademyError } from '../errors.js';
import {
  assertScene,
  emptyScene,
  parseScene,
  SCENE_MAX_BYTES,
  SCENE_VERSION,
  sceneByteSize,
  sceneWithinSizeBudget,
  sceneAvatarCount,
  scenePropCount,
  sceneBoardCard,
  sceneStatusLine,
  sceneStatusLineIsEmpty,
  sceneStatusLineDetailed,
  parseSceneStatusLine,
  sceneStatusLineMatches,
  sceneExportHeader,
  sceneExportLine,
  sceneExportText,
  sceneAvatarCountInRange,
  sceneBytesAtMost,
} from './scene.js';

describe('spatial scene contract (Stage-1)', () => {
  it('accepts emptyScene()', () => {
    const r = parseScene(emptyScene());
    expect(r).toEqual({ ok: true, scene: { version: SCENE_VERSION } });
  });

  it('accepts a minimal valid v1 scene with stage + avatar', () => {
    const r = parseScene({
      version: 1,
      stage: { width: 800, height: 600 },
      avatars: [{ id: 'a1', participantId: 'seat-9', position: { x: 10, y: 20 } }],
    });
    expect(r.ok).toBe(true);
  });

  it('rejects missing version', () => {
    const r = parseScene({ stage: { width: 1, height: 1 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid');
  });

  it('rejects unknown top-level keys (no free-form PII bag)', () => {
    const r = parseScene({ version: 1, email: 'x@y.z' });
    expect(r.ok).toBe(false);
  });

  it('rejects wrong version', () => {
    const r = parseScene({ version: 99 });
    expect(r.ok).toBe(false);
  });

  it('rejects oversized payload', () => {
    const big = { version: 1 as const, props: [] as { id: string; kind: string; position: { x: number; y: number } }[] };
    // pad via many props until over limit
    let i = 0;
    while (Buffer.byteLength(JSON.stringify(big), 'utf8') <= SCENE_MAX_BYTES) {
      big.props.push({ id: `p${i}`, kind: 'block', position: { x: i, y: i } });
      i += 1;
      if (i > 50_000) break;
    }
    const r = parseScene(big);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('oversized');
  });

  it('assertScene throws academy.scene_invalid', () => {
    expect(() => assertScene({ version: 2 })).toThrow(AcademyError);
    try {
      assertScene({});
    } catch (e) {
      expect(e).toBeInstanceOf(AcademyError);
      expect((e as AcademyError).code).toBe('academy.scene_invalid');
    }
  });
});

describe('L3 wave49 scene status/export', () => {
  it('board card and status for empty + populated', () => {
    const empty = emptyScene();
    expect(sceneStatusLineIsEmpty(empty)).toBe(true);
    expect(sceneAvatarCount(empty)).toBe(0);
    expect(scenePropCount(empty)).toBe(0);
    expect(sceneWithinSizeBudget(empty)).toBe(true);
    expect(sceneStatusLineMatches(empty)).toBe(true);
    expect(parseSceneStatusLine('nope')).toBeNull();
    expect(sceneExportText(empty).startsWith(sceneExportHeader())).toBe(true);
    expect(sceneAvatarCountInRange(empty, 0, 0)).toBe(true);
    expect(sceneAvatarCountInRange(empty, 1, 0)).toBe(false);
    expect(sceneBytesAtMost(empty, SCENE_MAX_BYTES)).toBe(true);
    expect(sceneBytesAtMost(empty, Number.NaN)).toBe(false);

    const full = {
      version: 1 as const,
      stage: { width: 800, height: 600 },
      avatars: [{ id: 'a1', participantId: 'seat-9', position: { x: 10, y: 20 } }],
      props: [{ id: 'p1', kind: 'desk', position: { x: 1, y: 2 } }],
    };
    expect(sceneBoardCard(full).avatars).toBe(1);
    expect(sceneBoardCard(full).props).toBe(1);
    expect(sceneStatusLine(full)).toContain('avatars=1');
    expect(sceneStatusLineDetailed(full)).toContain('stage=1');
    expect(sceneStatusLineMatches(full)).toBe(true);
    expect(sceneExportLine(full)).toContain('1,1,1,');
    expect(sceneByteSize(full)).toBeGreaterThan(0);
  });
});
