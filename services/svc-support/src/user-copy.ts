/**
 * User-visible copy for svc-support public / ops refuse paths and KB doors.
 *
 * Every string a client reads from a refuse on the public or ops door goes
 * through @intafaced/i18n. Mode is prod on purpose: a missing key must not throw
 * on a live ticket or KB refuse, and must not invent English — tUnsafe
 * renders the dotted key name, which is greppable and not blank.
 *
 * Catalog keys that already exist on tip are aliased from support error codes.
 * Codes with no catalog row stay the code itself until a catalog PR adds copy.
 * Ticket ids and operator diagnostic sentences stay on structured fields.
 */
import { createTranslator } from '@intafaced/i18n';

const translator = createTranslator('en', undefined, { mode: 'prod', onMissing: () => undefined });

/**
 * Support refuse codes that already have a catalog sentence. Unlisted codes
 * are passed through as keys — missing → dotted name, never invented copy.
 */
const CATALOG_ALIAS: Readonly<Record<string, string>> = {
  'support.not_found': 'error.notFound',
  'support.claim.not_found': 'error.notFound',
  'support.kb.not_published': 'error.notFound',
  'scope.denied': 'error.forbidden',
};

export function userCopy(key: string, params: Readonly<Record<string, string | number | bigint>> = {}): string {
  return translator.tUnsafe(CATALOG_ALIAS[key] ?? key, params);
}
