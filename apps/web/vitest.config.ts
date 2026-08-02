import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * The client layer is pure TypeScript — transports, state machines, money — and
 * is tested as such. No DOM: the things that can be wrong there (a gap that is
 * applied anyway, a token that is not attached, a dead service that throws
 * instead of returning a state) are all reachable without one.
 *
 * ── Why there are component tests now ───────────────────────────────────────
 *
 * Because that reasoning had a hole, and a lie lived in it for months. Every
 * test in this app was under `src/lib`, so nothing was watching the rendered
 * output, and the landing page shipped `68,412.50` for BTC/USDT under a
 * "Streaming" badge while `/api/v1/tickers` returned `last: null` for that same
 * market. The source said "Every value below is mock". The browser did not.
 *
 * The renderer is `react-dom/server`'s `renderToStaticMarkup`, not jsdom +
 * Testing Library, and that is deliberate rather than thrift:
 *
 *   · The bug was in the SERVED HTML. `renderToStaticMarkup` produces exactly
 *     that string, so the assertion is made against the artefact that misled a
 *     visitor — not against a DOM tree reconstructed from it.
 *   · A string is the right shape for the assertion we need. "No money-shaped
 *     literal appears anywhere in this page" is a scan over markup; expressing
 *     it through element queries would narrow it to the places we thought to
 *     look, which is the failure mode that let this through.
 *   · It adds no dependency. jsdom + @testing-library/react are ~40 packages to
 *     assert on a page with no interactivity.
 *
 * The limit is stated so nobody mistakes it for coverage: effects do not run,
 * so a `useService` tree renders in its initial state only. Components that
 * fetch are therefore split into a container and a pure view, and the view is
 * rendered directly in every state it can hold. See `market-pulse.test.tsx`.
 *
 * `include` is narrowed to `src` so a `next build` artefact in `.next` is never
 * collected as a test file.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
  // tsconfig.json says `jsx: preserve` because Next owns the emit. Vitest has
  // no Next in front of it, so the transform is named here instead.
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  // The `@/*` alias is Next's, from tsconfig.json. Components use it; the tests
  // that render them therefore need it too.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
