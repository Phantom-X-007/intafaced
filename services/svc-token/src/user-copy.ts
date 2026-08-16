/**
 * User-visible copy for `svc-token` stake / mint / distribute refuse paths.
 *
 * Every string a client reads from a refuse or status path goes through
 * `@intafaced/i18n`. Mode is `prod` on purpose: a missing key must not throw
 * on a live stake refuse, and must not invent English — `tUnsafe` renders
 * the dotted key name, which is greppable and not blank.
 *
 * Catalog keys that already exist on tip are aliased from token error codes.
 * Codes with no catalog row stay the code itself until a catalog PR adds copy.
 * Emission magnitudes and supply figures are never invented here (owner-only).
 */
import { createTranslator } from '@intafaced/i18n';

const translator = createTranslator('en', undefined, { mode: 'prod', onMissing: () => undefined });

/**
 * Token / ledger refuse codes that already have a catalog sentence. Unlisted
 * codes are passed through as keys — missing → dotted name, never invented copy.
 */
const CATALOG_ALIAS: Readonly<Record<string, string>> = {
  'token.stake_not_found': 'error.notFound',
  'token.proposal_not_found': 'error.notFound',
  'token.proposal_not_allowed': 'error.forbidden',
  'token.already_voted': 'error.forbidden',
  'ledger.insufficient_funds': 'error.insufficientFunds',
};

export function userCopy(key: string, params: Readonly<Record<string, string | number | bigint>> = {}): string {
  return translator.tUnsafe(CATALOG_ALIAS[key] ?? key, params);
}
