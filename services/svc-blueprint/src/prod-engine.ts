/**
 * Production engine posture — refuse mock, unpublished, and loopback URLs at boot.
 *
 * `BLUEPRINT_ENGINE_MODE` is a switch, not a fallback. A prod process that
 * boots `mock` (or `http` pointed at localhost, or an unset URL that used to
 * invent localhost / host.docker.internal) would serve stub profiles to real
 * people and look healthy doing it.
 *
 * Local/dev stay free to use the mock. This gate is `APP_ENV=prod` only.
 * Owner may set `http://host.docker.internal:4108` explicitly — it is not loopback.
 */

export const PROD_ENGINE_CONFIG_CODE = 'blueprint.prod_engine_config' as const;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

export class ProdEngineConfigError extends Error {
  readonly code = PROD_ENGINE_CONFIG_CODE;

  constructor(message: string) {
    super(message);
    this.name = 'ProdEngineConfigError';
  }
}

export interface ProdEngineEnv {
  readonly APP_ENV: string;
  readonly BLUEPRINT_ENGINE_MODE: 'http' | 'mock';
  readonly BLUEPRINT_ENGINE_URL?: string;
}

export function isLoopbackEngineUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return true;
  }
  // Node keeps brackets on IPv6 hostnames (`[::1]`).
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  return LOOPBACK_HOSTS.has(host);
}

export function assertProdEngine(env: ProdEngineEnv): void {
  if (env.APP_ENV !== 'prod') return;

  if (env.BLUEPRINT_ENGINE_MODE === 'mock') {
    throw new ProdEngineConfigError(
      `APP_ENV=prod refuses BLUEPRINT_ENGINE_MODE=mock (${PROD_ENGINE_CONFIG_CODE}). ` +
        `Production must reach a real Neural Engine over HTTP — mock is a local stand-in, not a fallback. ` +
        `Set BLUEPRINT_ENGINE_MODE=http and BLUEPRINT_ENGINE_URL to the engine deployment.`,
    );
  }

  if (!env.BLUEPRINT_ENGINE_URL) {
    throw new ProdEngineConfigError(
      `APP_ENV=prod refuses unset BLUEPRINT_ENGINE_URL (${PROD_ENGINE_CONFIG_CODE}). ` +
        `Blank is unpublished — will not invent http://localhost:4108 or http://host.docker.internal:4108. ` +
        `Set BLUEPRINT_ENGINE_URL to the engine deployment.`,
    );
  }

  if (isLoopbackEngineUrl(env.BLUEPRINT_ENGINE_URL)) {
    throw new ProdEngineConfigError(
      `APP_ENV=prod refuses BLUEPRINT_ENGINE_URL=${env.BLUEPRINT_ENGINE_URL} (${PROD_ENGINE_CONFIG_CODE}). ` +
        `Loopback is not a production engine. ` +
        `Set BLUEPRINT_ENGINE_URL to the engine deployment.`,
    );
  }
}
