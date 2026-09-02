/**
 * Versioned public rulebook door (M00). Halt/delist stay on their own doors.
 * MATCHING_RULEBOOK_VERSION is the version string only — never rule text,
 * fees, or haircuts. Blank is unpublished.
 */
import { userCopy } from './user-copy.js';

export const RULEBOOK_UNPUBLISHED = 'matching.rulebook_unpublished' as const;
export const BEST_EXECUTION_UNPROVEN = 'matching.best_execution_unproven' as const;
export const CERTIFIED_VENUE_UNPROVEN = 'matching.certified_venue_unproven' as const;

export type RulebookPublication = { readonly published: false } | { readonly published: true; readonly version: string };

export type RulebookRefuse = {
  readonly code: typeof RULEBOOK_UNPUBLISHED;
  readonly message: string;
};

export type ClaimRefuse = {
  readonly allowed: false;
  readonly rejected: { readonly code: string; readonly message: string };
};

export type RulebookPublicView =
  | {
      readonly published: false;
      readonly version: null;
      readonly rejected: RulebookRefuse;
    }
  | {
      readonly published: true;
      readonly version: string;
    };

export function readRulebook(raw: string | null | undefined): RulebookPublication {
  const version = (raw ?? '').trim();
  if (version.length === 0) return { published: false };
  return { published: true, version };
}

export function rulebookUnpublishedRefuse(): RulebookRefuse {
  return { code: RULEBOOK_UNPUBLISHED, message: userCopy(RULEBOOK_UNPUBLISHED) };
}

export function presentRulebook(publication: RulebookPublication): RulebookPublicView {
  if (!publication.published) {
    return { published: false, version: null, rejected: rulebookUnpublishedRefuse() };
  }
  return { published: true, version: publication.version };
}

/** M00-R06: a version string is not best-execution evidence. Unpublished refuses first. */
export function bestExecutionClaim(publication: RulebookPublication): ClaimRefuse {
  if (!publication.published) {
    return { allowed: false, rejected: rulebookUnpublishedRefuse() };
  }
  return {
    allowed: false,
    rejected: { code: BEST_EXECUTION_UNPROVEN, message: userCopy(BEST_EXECUTION_UNPROVEN) },
  };
}

/** M00-R06: a version string is not a certified-venue seal. Unpublished refuses first. */
export function certifiedVenueClaim(publication: RulebookPublication): ClaimRefuse {
  if (!publication.published) {
    return { allowed: false, rejected: rulebookUnpublishedRefuse() };
  }
  return {
    allowed: false,
    rejected: { code: CERTIFIED_VENUE_UNPROVEN, message: userCopy(CERTIFIED_VENUE_UNPROVEN) },
  };
}
