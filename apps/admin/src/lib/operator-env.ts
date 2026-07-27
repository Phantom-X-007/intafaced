import 'server-only';
import { baseEnvSchema, loadEnv, type Drop } from '@intafaced/config';

/**
 * The console's own view of the platform environment.
 *
 * §11: "the drop sequence is configuration, not deployment risk" — so the drop
 * the console reports is whatever `LAUNCH_DROP` says right now, read per request
 * (every page is `force-dynamic`), never baked in at build time.
 *
 * Nothing else in this app reads `process.env`.
 */

export interface OperatorEnv {
  readonly drop: Drop;
  readonly appEnv: string;
  /**
   * `INTAFACED_FLAG_*` variables currently set on this process, passed straight
   * into `FlagContext.env` so the console resolves flags through exactly the
   * same precedence chain the services use. An operator has to be able to see
   * that a flag is on because of an env override and not because of the drop.
   */
  readonly flagEnv: Record<string, string>;
}

export function readOperatorEnv(): OperatorEnv {
  const base = loadEnv(baseEnvSchema, { ...process.env, SERVICE_NAME: 'apps-admin' });

  const flagEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('INTAFACED_FLAG_') && value !== undefined) flagEnv[key] = value;
  }

  return { drop: base.LAUNCH_DROP, appEnv: base.APP_ENV, flagEnv };
}
