/**
 * User-visible copy for svc-indexer public / read-model refuse paths.
 *
 * Every string a client reads from a refuse on the public door (book, fills,
 * positions, markets) goes through @intafaced/i18n. Mode is prod on purpose: a
 * missing key must not throw on a live halt or chain-door refuse, and must not
 * invent English — tUnsafe renders the dotted key name, which is greppable
 * and not blank. That is also the honesty pin: an unread holding is named
 * (indexer.chain_not_configured), never a silent zero or a live empty book.
 *
 * Catalog keys that already exist on tip are aliased from indexer error codes.
 * Codes with no catalog row stay the code itself until a catalog PR adds copy.
 * Operator diagnostics (halt.reason, lastError.message, /ready halt wording)
 * stay on structured fields.
 */
import { createTranslator } from '@intafaced/i18n';

const translator = createTranslator('en', undefined, { mode: 'prod', onMissing: () => undefined });

/**
 * Indexer refuse codes that already have a catalog sentence. Unlisted codes
 * are passed through as keys — missing → dotted name, never invented copy.
 */
const CATALOG_ALIAS: Readonly<Record<string, string>> = {
  'indexer.request_failed': 'error.generic',
};

export function userCopy(key: string, params: Readonly<Record<string, string | number | bigint>> = {}): string {
  return translator.tUnsafe(CATALOG_ALIAS[key] ?? key, params);
}
