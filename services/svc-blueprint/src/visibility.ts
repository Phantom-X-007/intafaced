import type { Visibility } from '@intafaced/contracts';

/**
 * Whose share card a viewer may see.
 *
 * Pure: no clock, no I/O. The service supplies `sameCrew` from a join; this
 * function is the rule `packages/auth` already names — reading someone else's
 * is governed by `blueprints.visibility` on top of `blueprint:read`.
 *
 * Denied and missing collapse to the same answer at the service (`not_found`).
 * This function only answers the visibility half; a missing row is the caller's
 * job.
 */
export function mayViewCard(input: {
  readonly viewerId: string;
  readonly subjectUserId: string;
  readonly visibility: Visibility;
  readonly sameCrew: boolean;
}): boolean {
  if (input.viewerId === input.subjectUserId) return true;
  if (input.visibility === 'private') return false;
  if (input.visibility === 'public') return true;
  return input.sameCrew;
}
