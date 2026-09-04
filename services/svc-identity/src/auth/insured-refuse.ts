/**
 * R-security: identity never claims “insured”.
 * Honest negations (not insured / uninsured) stay; an affirmative claim refuses.
 * Does not invent a coverage product or an owner seal.
 */
import { assertMarketingLanguageAllowed } from '@intafaced/config';

export const INSURED_REFUSED = 'identity.insured_refused' as const;
export const INSURED_REFUSED_MESSAGE = 'identity does not claim insured; never describe accounts or deposits as insured';

export type InsuredRefuse = {
  readonly accepted: false;
  readonly rejected: { readonly code: typeof INSURED_REFUSED; readonly message: string };
};

export type InsuredOk = { readonly accepted: true };

export function refuseInsuredClaim(text: string): InsuredOk | InsuredRefuse {
  const verdict = assertMarketingLanguageAllowed(text);
  if (!verdict.ok && verdict.words.includes('insured')) {
    return { accepted: false, rejected: { code: INSURED_REFUSED, message: INSURED_REFUSED_MESSAGE } };
  }
  return { accepted: true };
}

/** User-copy path: never emit an insured claim; return the named refuse key instead. */
export function copyWithoutInsuredClaim(rendered: string): string {
  const verdict = refuseInsuredClaim(rendered);
  if (!verdict.accepted) return verdict.rejected.code;
  return rendered;
}
