import { describe, expect, it } from 'vitest';
import { emptyScene, SCENE_MAX_BYTES } from './scene.js';
import { isDurableSceneEmpty, loadSceneState, persistSceneState, requirePopulatedScene, SCENE_EMPTY_REFUSE } from './scene-state.js';

const populated = {
  version: 1 as const,
  stage: { width: 800, height: 600 },
  avatars: [{ id: 'a1', participantId: 'seat-1', position: { x: 10, y: 20 } }],
};

describe('durable scene state persist/load', () => {
  it('round-trips a populated scene through JSON (jsonb SoT)', () => {
    const persisted = persistSceneState(populated);
    expect(persisted.ok).toBe(true);
    if (!persisted.ok) return;
    expect(persisted.occupancy).toBe('populated');
    const stored = JSON.parse(JSON.stringify(persisted.scene)) as unknown;
    const loaded = loadSceneState(stored);
    expect(loaded).toEqual({
      ok: true,
      scene: persisted.scene,
      occupancy: 'populated',
      source: 'stored',
    });
  });

  it('loads legacy {} / null as honest empty — not a 1000×1000 room', () => {
    for (const stored of [null, undefined, {}]) {
      const loaded = loadSceneState(stored);
      expect(loaded).toEqual({
        ok: true,
        scene: emptyScene(),
        occupancy: 'empty',
        source: 'empty_default',
      });
      if (!loaded.ok) continue;
      expect(loaded.scene.stage).toBeUndefined();
      expect(JSON.stringify(loaded.scene)).not.toContain('1000');
    }
  });

  it('persists empty v1 as empty occupancy (allowed store, not a fake room)', () => {
    const persisted = persistSceneState(emptyScene());
    expect(persisted.ok).toBe(true);
    if (!persisted.ok) return;
    expect(persisted.occupancy).toBe('empty');
    expect(isDurableSceneEmpty(persisted.scene)).toBe(true);
  });

  it('stage-only scene is populated (host authored a room)', () => {
    const r = persistSceneState({ version: 1, stage: { width: 400, height: 300 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.occupancy).toBe('populated');
    expect(requirePopulatedScene(r.scene).ok).toBe(true);
  });

  it('refuses invalid / oversized stored payloads — does not invent empty room', () => {
    const invalid = loadSceneState({ version: 99 });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.reason).toBe('invalid');

    const big = { version: 1 as const, props: [] as { id: string; kind: string; position: { x: number; y: number } }[] };
    let i = 0;
    while (Buffer.byteLength(JSON.stringify(big), 'utf8') <= SCENE_MAX_BYTES) {
      big.props.push({ id: `p${i}`, kind: 'block', position: { x: i, y: i } });
      i += 1;
      if (i > 50_000) break;
    }
    const oversized = persistSceneState(big);
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.reason).toBe('oversized');
  });
});

describe('named refuse when scene is empty', () => {
  it('requirePopulatedScene refuses empty with academy.scene_empty', () => {
    const loaded = loadSceneState({});
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const use = requirePopulatedScene(loaded.scene);
    expect(use).toEqual({
      ok: false,
      reason: SCENE_EMPTY_REFUSE,
      message: 'scene is empty — no stage, avatars, or props; refuse fake room',
    });
    expect(use.ok).toBe(false);
    if (use.ok) return;
    expect(use.reason).toBe('academy.scene_empty');
    expect('scene' in use).toBe(false);
  });

  it('requirePopulatedScene allows a populated stored scene', () => {
    const loaded = loadSceneState(populated);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(requirePopulatedScene(loaded.scene)).toEqual({ ok: true, scene: loaded.scene });
  });
});
