/**
 * svc-academy's own failure vocabulary.
 *
 * Codes are stable strings because they are what an SLO dashboard groups by and
 * what a client branches on. `academy.room_full` and `academy.stake_required`
 * are both "you cannot take this seat", and collapsing them would leave the
 * user unable to tell whether to wait or to stake.
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
  | 'academy.curriculum_not_found'
  | 'academy.curriculum_unpublished'
  | 'academy.not_enrolled'
  | 'academy.item_locked'
  | 'academy.item_not_in_path'
  | 'academy.path_incomplete'
  | 'academy.already_certified';

export class AcademyError extends Error {
  constructor(
    message: string,
    readonly code: AcademyErrorCode,
  ) {
    super(message);
    this.name = 'AcademyError';
  }
}
