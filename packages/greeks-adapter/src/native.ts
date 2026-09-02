/**
 * QuantLib C++ 1.43 loads only when INTAFACED_QUANTLIB_NATIVE names the addon.
 * Blank/unset env unlinks — refuse rather than auto-discover a .node or invent Greeks.
 * CARD E1 / PTX-M11-R02.
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { NativeQuantLib } from './types.js';

const require = createRequire(import.meta.url);

export const NATIVE_ENV = 'INTAFACED_QUANTLIB_NATIVE';

export function nativeAddonPath(): string | null {
  const raw = process.env[NATIVE_ENV];
  if (raw === undefined) return null;
  const path = raw.trim();
  if (path.length === 0) return null;
  if (!existsSync(path)) return null;
  return path;
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
