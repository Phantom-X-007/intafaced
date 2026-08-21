import type { CardRenderer } from './card/card-renderer.js';
import { isUsable, type NeuralEngineClient } from './engine/neural-engine.js';

/**
 * `/ready` payload. `ready` is process-up, not engine-usable.
 *
 * `isUsable` is a 60s last-call window. HttpNeuralEngineClient starts unhealthy
 * ("no call made yet"), so gating kube on `isUsable` would never admit the pod:
 * no traffic → no first profile call → never usable. The in-process mock also
 * reports unusable one minute after boot while still serving profiles
 * (docs/RUNNING.md). Honest flag is `engine.usable`; flipping `ready` off it
 * is a kube-suicide probe.
 *
 * The card renderer is reported and does NOT gate readiness. A card can be
 * produced without a rasterizer; refusing traffic because the PNG rail is
 * absent would take down onboarding over a share image.
 */
export function blueprintReadiness(input: {
  engine: NeuralEngineClient;
  engineMode: 'http' | 'mock';
  cardRenderer: Pick<CardRenderer, 'id'>;
  cardRendererConfigured: boolean;
  now?: Date;
}): {
  ready: true;
  engine: { id: string; usable: boolean; mode: 'http' | 'mock' };
  cardRenderer: { id: string; configured: boolean };
} {
  return {
    ready: true,
    engine: {
      id: input.engine.id,
      usable: isUsable(input.engine, input.now),
      mode: input.engineMode,
    },
    cardRenderer: {
      id: input.cardRenderer.id,
      configured: input.cardRendererConfigured,
    },
  };
}
