import { defineConfig } from 'vitest/config';

/**
 * The client layer is pure TypeScript — transports, state machines, money — and
 * is tested as such. No DOM, no component renderer: the things that can be
 * wrong here (a gap that is applied anyway, a token that is not attached, a
 * dead service that throws instead of returning a state) are all reachable
 * without one, and a jsdom dependency to assert them would be ceremony.
 *
 * `include` is narrowed to `src` so a `next build` artefact in `.next` is never
 * collected as a test file.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
