/**
 * AMBASSADOR PROGRAMME — Stage-1 status only (TRK-academy.ambassadors).
 *
 * Appoint / freeze / public badge. NO pay, NO revenue share, NO ledger client.
 * Hosting a lobby remains §4.1 `lobbyHostRights` (host-rights.ts) — programme
 * status is a label + operator control surface, not a second host gate that
 * could contradict identity rank law.
 *
 * Rights matrix (Stage-1, checkable):
 *
 * | Capability                         | Gate                                      |
 * | ---------------------------------- | ----------------------------------------- |
 * | Open lobby / invite / run session  | `lobbyHostRights` perk (svc-identity)     |
 * | Programme badge `active`           | row in ambassadors with status=active     |
 * | Programme badge `frozen`           | row with status=frozen                    |
 * | Appoint / freeze / unfreeze        | operator `admin:write` on the API         |
 * | IFC pay / revenue share            | NOT built (Class M Stage-2)               |
 *
 * An active ambassador without lobbyHostRights still cannot create rooms.
 * A host with lobbyHostRights who is not appointed still hosts — programme
 * layers on rank; it does not replace it.
 */

export type AmbassadorStatus = 'active' | 'frozen';

export interface AmbassadorRecord {
  userId: string;
  status: AmbassadorStatus;
  appointedBy: string;
  appointedAt: Date;
  frozenAt: Date | null;
  frozenBy: string | null;
  freezeReason: string | null;
}

export interface AmbassadorBadge {
  userId: string;
  /** true only when an active programme row exists */
  isAmbassador: boolean;
  status: AmbassadorStatus | null;
}

/** Pure: badge view from optional row. */
export function badgeOf(userId: string, row: AmbassadorRecord | null): AmbassadorBadge {
  if (!row) return { userId, isAmbassador: false, status: null };
  return {
    userId,
    isAmbassador: row.status === 'active',
    status: row.status,
  };
}

/** Pure: validate freeze reason before write. */
export function assertFreezeReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    throw new AmbassadorProgrammeError('Freeze reason must name why (min 3 characters after trim)', 'academy.ambassador_invalid');
  }
  if (trimmed.length > 500) {
    throw new AmbassadorProgrammeError('Freeze reason max 500 characters', 'academy.ambassador_invalid');
  }
  return trimmed;
}

export type AmbassadorProgrammeErrorCode =
  'academy.ambassador_not_found' | 'academy.ambassador_already_active' | 'academy.ambassador_already_frozen' | 'academy.ambassador_invalid';

export class AmbassadorProgrammeError extends Error {
  constructor(
    message: string,
    readonly code: AmbassadorProgrammeErrorCode,
  ) {
    super(message);
    this.name = 'AmbassadorProgrammeError';
  }
}
