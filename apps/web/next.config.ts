import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Workspace packages ship untranspiled-for-Next ESM (and, for `@intafaced/ui`,
   * a raw `tokens.css`). Without this, Next treats them as externals and the CSS
   * import from `layout.tsx` never reaches the bundler.
   *
   * Only browser-safe packages are listed. `@intafaced/contracts` is imported at
   * the `/identity` subpath for its zod schemas alone — its root export reaches
   * `node:crypto` through `edge.ts`, which has no business in a browser bundle
   * and would not resolve in one anyway.
   */
  transpilePackages: ['@intafaced/ui', '@intafaced/config', '@intafaced/contracts', '@intafaced/ledger-client', '@intafaced/market-data'],

  /**
   * pnpm symlinks workspace deps, so Next's file tracer walks up out of
   * `apps/web` and guesses at the workspace root. Pointing it at the monorepo
   * root makes the traced output deterministic and silences the "inferred your
   * workspace root" warning. `process.cwd()` is the package directory under
   * both `pnpm --filter` and turbo, which both run tasks from the package.
   */
  outputFileTracingRoot: path.join(process.cwd(), '../../'),

  reactStrictMode: true,

  /** The build is a gate, not a suggestion (§14). */
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
