/**
 * Optional load of the QuantLib C++ addon.
 *
 * Missing/unloadable native code is unavailable — not a cue to invent Greeks.
 * Build: `pnpm --filter @intafaced/greeks-adapter native:build` against
 * lballabio/QuantLib 1.43 (see QUANTLIB.pin.json). Default TypeScript build
 * does not compile C++.
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NativeQuantLib } from './types.js';

const require = createRequire(import.meta.url);

export const NATIVE_ENV = 'INTAFACED_QUANTLIB_NATIVE';

function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}

function candidates(): readonly string[] {
  const fromEnv = process.env[NATIVE_ENV];
  const root = packageRoot();
  return [
    ...(fromEnv && fromEnv.trim().length > 0 ? [fromEnv.trim()] : []),
    join(root, 'native', 'quantlib_greeks.node'),
    join(root, 'native', 'build', 'Release', 'quantlib_greeks.node'),
  ];
}

export function nativeAddonPath(): string | null {
  for (const path of candidates()) {
    if (existsSync(path)) return path;
  }
  return null;
}

export function loadNativeQuantLib(): NativeQuantLib | null {
  const path = nativeAddonPath();
  if (path === null) return null;
  try {
    const loaded: unknown = require(path);
    if (!isNativeQuantLib(loaded)) return null;
    return loaded;
  } catch {
    return null;
  }
}

function isNativeQuantLib(value: unknown): value is NativeQuantLib {
  if (typeof value !== 'object' || value === null) return false;
  const rec = value as { vanillaEuropean?: unknown; yearFraction?: unknown };
  return typeof rec.vanillaEuropean === 'function' && typeof rec.yearFraction === 'function';
}
