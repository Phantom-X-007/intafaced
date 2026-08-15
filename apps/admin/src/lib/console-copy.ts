/**
 * Operator-visible copy for `apps/admin`.
 *
 * Every string an operator reads on the status banner / kill-switch plane
 * titles goes through `@intafaced/i18n`. Mode is `prod` on purpose: a missing
 * key must not throw (this console is the incident surface) and must not invent
 * English — `tUnsafe` renders the key name, which is greppable and not blank.
 */
import { createTranslator } from '@intafaced/i18n';

const translator = createTranslator('en', undefined, { mode: 'prod', onMissing: () => undefined });

export function consoleCopy(key: string, params: Readonly<Record<string, string | number | bigint>> = {}): string {
  return translator.tUnsafe(key, params);
}
