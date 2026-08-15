import { describe, expect, it } from 'vitest';
import { AcademyError } from '../errors.js';
import { emptyScene, SCENE_MAX_BYTES, SCENE_VERSION } from './scene.js';
import {
  assertExportVrScene,
  exportVrScene,
  VR_EXPORT_FORBIDDEN_KEYS,
  VR_SCENE_VERSION,
  vrExportContainsForbiddenKeys,
} from './vr-export.js';

describe('spatial Stage-3 VR-ready export', () => {
  it('exports empty scene with default stage and no invented avatars', () => {
    const r = exportVrScene(emptyScene());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dto).toEqual({
      version: VR_SCENE_VERSION,
      stage: { width: 1000, height: 1000, depth: 0 },
      avatars: [],
      props: [],
    });
    expect(r.bytes).toBeLessThanOrEqual(SCENE_MAX_BYTES);
    expect(r.bytes).toBe(Buffer.byteLength(JSON.stringify(r.dto), 'utf8'));
  });

  it('exports populated scene as id+xyz+facing / id+kind+xyz', () => {
    const r = exportVrScene({
      version: SCENE_VERSION,
      stage: { width: 800, height: 600 },
      avatars: [{ id: 'a1', participantId: 'seat-9', position: { x: 10, y: 20 }, facing: 1.5 }],
      props: [{ id: 'p1', kind: 'desk', position: { x: 3, y: 4 } }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dto.avatars).toEqual([{ id: 'a1', x: 10, y: 20, z: 0, facing: 1.5 }]);
    expect(r.dto.props).toEqual([{ id: 'p1', kind: 'desk', x: 3, y: 4, z: 0 }]);
    expect(r.dto.stage).toEqual({ width: 800, height: 600, depth: 0 });
    expect(r.bytes).toBeLessThanOrEqual(SCENE_MAX_BYTES);
  });

  it('defaults facing to 0 when Scene v1 omitted it', () => {
    const r = exportVrScene({
      version: 1,
      avatars: [{ id: 'a1', participantId: 'seat-1', position: { x: 1, y: 2 } }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dto.avatars[0]!.facing).toBe(0);
  });

  it('rejects invalid scene and does not invent avatars', () => {
    const r = exportVrScene({ version: 99 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('invalid');
    expect(r).not.toHaveProperty('dto');
  });

  it('rejects unknown PII bag keys on the source scene', () => {
    const r = exportVrScene({ version: 1, email: 'x@y.z' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid');
  });

  it('rejects oversized payload', () => {
    const big = {
      version: 1 as const,
      props: [] as { id: string; kind: string; position: { x: number; y: number } }[],
    };
    let i = 0;
    while (Buffer.byteLength(JSON.stringify(big), 'utf8') <= SCENE_MAX_BYTES) {
      big.props.push({ id: `p${i}`, kind: 'block', position: { x: i, y: i } });
      i += 1;
      if (i > 50_000) break;
    }
    const r = exportVrScene(big);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('oversized');
  });

  it('export JSON never includes PII keys', () => {
    const r = exportVrScene({
      version: 1,
      stage: { width: 100, height: 100, backgroundKey: 'room-a' },
      avatars: [
        {
          id: 'a1',
          participantId: 'seat-9',
          position: { x: 1, y: 2 },
          labelKey: 'host',
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(vrExportContainsForbiddenKeys(r.dto)).toBe(false);
    const encoded = JSON.stringify(r.dto);
    for (const key of VR_EXPORT_FORBIDDEN_KEYS) {
      expect(encoded).not.toContain(`"${key}"`);
    }
    expect(encoded).not.toContain('seat-9');
    expect(encoded).not.toContain('room-a');
    expect(encoded).not.toContain('host');
  });

  it('assertExportVrScene throws academy.scene_invalid', () => {
    expect(() => assertExportVrScene({})).toThrow(AcademyError);
    try {
      assertExportVrScene({ version: 2 });
    } catch (e) {
      expect(e).toBeInstanceOf(AcademyError);
      expect((e as AcademyError).code).toBe('academy.scene_invalid');
    }
  });
});
