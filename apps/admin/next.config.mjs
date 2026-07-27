import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * apps/admin — the operator console (§8.8, §14.6).
 *
 * Nothing here is cached and nothing here is exported statically: the console
 * reports the state of the platform as it is right now, and a stale kill-switch
 * reading is worse than no reading at all.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // pnpm workspace: trace from the repo root so the symlinked @intafaced/*
  // packages are resolved from packages/ rather than guessed at.
  outputFileTracingRoot: join(here, '..', '..'),
  // Lint is a repo-level turbo task, not a Next build step.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
