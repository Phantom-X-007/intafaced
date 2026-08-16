/**
 * User-visible copy for svc-matching operator / public refuse paths.
 *
 * Every string a client reads from a refuse on the HTTP inject door goes through
 * @intafaced/i18n. Mode is prod on purpose: a missing key must not throw
 * on a live cancel or depth refuse, and must not invent English — 	Unsafe
 * renders the dotted key name, which is greppable and not blank.
 *
 * Catalog keys that already exist on tip are aliased from matching error codes.
 * Codes with no catalog row stay the code itself until a catalog PR adds copy.
 * Order ids, market ids, and auth reject codes stay on structured fields.
 */
import { createTranslator } from '@intafaced/i18n';

const translator = createTranslator('en', undefined, { mode: 'prod', onMissing: () => undefined });

/**
 * Matching refuse codes that already have a catalog sentence. Unlisted codes
 * are passed through as keys — missing → dotted name, never invented copy.
 */
const CATALOG_ALIAS: Readonly<Record<string, string>> = {
  'matching.unauthenticated': 'error.unauthorized',
  'matching.order_not_found': 'error.notFound',
  'matching.market_not_found': 'error.notFound',
};

export function userCopy(key: string, params: Readonly<Record<string, string | number | bigint>> = {}): string {
  return translator.tUnsafe(CATALOG_ALIAS[key] ?? key, params);
}
