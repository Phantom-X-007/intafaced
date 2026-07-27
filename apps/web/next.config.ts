import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * `@intafaced/ui` is a workspace package that ships untranspiled-for-Next
   * ESM plus a raw `tokens.css`. Without this, Next treats it as an external
   * and the CSS import from `layout.tsx` never reaches the bundler.
   */
  transpilePackages: ['@intafaced/ui'],

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
