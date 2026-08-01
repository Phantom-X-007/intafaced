/**
 * svc-academy's own failure vocabulary.
 *
 * Codes are stable strings because they are what an SLO dashboard groups by and
 * what a client branches on. `academy.room_full` and `academy.stake_required`
 * are both "you cannot take this seat", and collapsing them would leave the
 * user unable to tell whether to wait or to stake.
 *
 * The two `_unavailable` codes are deliberately NOT refusals. They say "we
 * could not find out", which is a different sentence to "no" and belongs to an
 * operator rather than to the caller — see stake-source.ts and host-rights.ts
 * for why both still fail closed at the point of decision.
 */
export type AcademyErrorCode =
  | 'academy.room_not_found'
  | 'academy.session_not_found'
  | 'academy.session_not_live'
  | 'academy.not_host'
  | 'academy.room_full'
  | 'academy.stake_required'
  | 'academy.invite_required'
  | 'academy.stake_unavailable'
  | 'academy.stream_unavailable'
  /** §4.1 `rank_thresholds.perks.lobbyHostRights` — this rank does not host. */
  | 'academy.host_rights_required'
  | 'academy.host_rights_unavailable'
  /** Curriculum catalog slug is not in the day-one spine. */
  | 'academy.curriculum_not_found';

export class AcademyError extends Error {
  constructor(
    message: string,
    readonly code: AcademyErrorCode,
  ) {
    super(message);
    this.name = 'AcademyError';
  }
}
