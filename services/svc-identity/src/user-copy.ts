/**
 * User-visible copy for `svc-identity` auth / KYC / rank refuse paths.
 *
 * Every string a client reads from a refuse or status path goes through
 * `@intafaced/i18n`. Mode is `prod` on purpose: a missing key must not throw
 * on a live sign-in refuse, and must not invent English — `tUnsafe` renders
 * the dotted key name, which is greppable and not blank.
 *
 * Catalog keys that already exist on tip are aliased from identity error codes.
 * Codes with no catalog row stay the code itself until a catalog PR adds copy.
 * Screening lists and KYC decisions are never invented here (Class X).
 */
import { createTranslator } from '@intafaced/i18n';

const translator = createTranslator('en', undefined, { mode: 'prod', onMissing: () => undefined });

/**
 * Identity refuse codes that already have a catalog sentence. Unlisted codes
 * are passed through as keys — missing → dotted name, never invented copy.
 */
const CATALOG_ALIAS: Readonly<Record<string, string>> = {
  'auth.not_found': 'error.notFound',
  'auth.session_invalid': 'auth.session.expired',
  'auth.session_reused': 'auth.session.expired',
  'auth.mfa_required': 'auth.twofa.title',
  'auth.account_frozen': 'error.forbidden',
  'auth.sub_account_denied': 'error.forbidden',
  'auth.sub_account_revoked': 'error.forbidden',
  'auth.sub_account_limit': 'error.forbidden',
  'auth.mfa_not_enrolled': 'error.forbidden',
  'auth.webauthn_not_enrolled': 'error.forbidden',
};

export function userCopy(key: string, params: Readonly<Record<string, string | number | bigint>> = {}): string {
  return translator.tUnsafe(CATALOG_ALIAS[key] ?? key, params);
}
