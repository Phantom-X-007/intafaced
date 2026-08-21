/**
 * D26-P1-SP1M — academy.spatial mount vs tracker honest gaps.
 *
 * Scene v1 schema + host write policy — navigable shell product residual.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SPATIAL_TRACKER_ID = 'academy.spatial' as const;

export const SPATIAL_PRODUCT_SYMBOLS = ['SCENE_MAX_BYTES', 'parseScene', 'decideHostSceneWrite', 'sceneIsNavigableProductShell'] as const;

export const SPATIAL_DONE_BAR_TEST_FILES = [
  'scene.test.ts',
  'edit-policy.test.ts',
  'update-scene-policy.test.ts',
  'mount-vs-tracker.test.ts',
] as const;

export const SPATIAL_HONEST_GAPS = ['gap.navigable_shell_product', 'gap.canvas_ui_craft'] as const;

export function spatialSymbolsInSource(): readonly (typeof SPATIAL_PRODUCT_SYMBOLS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const scene = readFileSync(join(here, 'scene.ts'), 'utf8');
  const policy = readFileSync(join(here, 'edit-policy.ts'), 'utf8');
  const blob = [scene, policy].join('\n');
  return SPATIAL_PRODUCT_SYMBOLS.filter((name) => new RegExp(`\\b${name}\\b`).test(blob));
}

export function spatialHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const scene = readFileSync(join(here, 'scene.ts'), 'utf8');
  return /SCENE_MAX_BYTES/.test(scene) && /sceneIsNavigableProductShell/.test(scene) && /SCENE_NAVIGABLE_SHELL_RESIDUAL/.test(scene);
}

export function spatialDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return SPATIAL_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function academySpatialTrackerBackendDoneBarMet(): boolean {
  return spatialSymbolsInSource().length === SPATIAL_PRODUCT_SYMBOLS.length && spatialHonestInSource() && spatialDoneBarTestsPresent();
}

export function academySpatialMountVsTrackerBoardCard(): {
  readonly tracker: typeof SPATIAL_TRACKER_ID;
  readonly symbols: number;
  readonly symbolsPresent: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const present = spatialSymbolsInSource();
  return {
    tracker: SPATIAL_TRACKER_ID,
    symbols: SPATIAL_PRODUCT_SYMBOLS.length,
    symbolsPresent: present.length,
    gaps: SPATIAL_HONEST_GAPS.length,
    backendDoneBarMet: academySpatialTrackerBackendDoneBarMet(),
  };
}
