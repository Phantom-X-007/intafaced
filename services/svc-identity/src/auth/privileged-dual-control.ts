/**
 * R-security hitch: privileged identity mutates need two distinct actors.
 * Reuses four-eyes dual-control. Does not invent a second approver or a threshold.
 * Wraps AuthService / FreezeService without recutting router.ts — missing confirm refuses.
 */
import { TRPCError } from '@intafaced/contracts';
import type { AuthService } from './auth-service.js';
import type { FreezeService } from '../affiliates/freeze-service.js';
import { DUAL_CONTROL_MISSING, DUAL_CONTROL_MISSING_MESSAGE, fourEyes, type DualControlCmd } from './four-eyes.js';

const AUTH_FLAG = Symbol.for('intafaced.identity.privileged-dual-control.auth');
const FREEZE_FLAG = Symbol.for('intafaced.identity.privileged-dual-control.freeze');

export class PrivilegedDualControlError extends Error {
  constructor(
    message: string,
    readonly code: typeof DUAL_CONTROL_MISSING,
  ) {
    super(message);
    this.name = 'PrivilegedDualControlError';
  }
}

export function requirePrivilegedDualControl(cmd: DualControlCmd | undefined): void {
  const eyes = fourEyes('policy', cmd ?? {});
  if (!eyes.accepted) {
    throw new PrivilegedDualControlError(eyes.rejected.message, eyes.rejected.code);
  }
}

function refuseOnWire(cmd: DualControlCmd | undefined): void {
  try {
    requirePrivilegedDualControl(cmd);
  } catch (err) {
    if (err instanceof PrivilegedDualControlError) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message, cause: err });
    }
    throw err;
  }
}

function readConfirm(input: object): string | null {
  if (!('confirmActorId' in input)) return null;
  const raw = (input as { confirmActorId?: string | null }).confirmActorId;
  return raw ?? null;
}

/** Freeze / unfreeze / KYC review refuse unless a second distinct actor is named. */
export function installPrivilegedDualControl(auth: AuthService): void {
  const tagged = auth as AuthService & { [AUTH_FLAG]?: true };
  if (tagged[AUTH_FLAG]) return;
  tagged[AUTH_FLAG] = true;

  const freezeIdentity = auth.freezeIdentity.bind(auth);
  auth.freezeIdentity = async (userId: string, cmd?: DualControlCmd) => {
    refuseOnWire(cmd);
    return freezeIdentity(userId);
  };

  const unfreezeIdentity = auth.unfreezeIdentity.bind(auth);
  auth.unfreezeIdentity = async (userId: string, cmd?: DualControlCmd) => {
    refuseOnWire(cmd);
    return unfreezeIdentity(userId);
  };

  const approveKycRecord = auth.approveKycRecord.bind(auth);
  auth.approveKycRecord = async (input) => {
    refuseOnWire({ actorId: input.reviewerId, confirmActorId: readConfirm(input) });
    return approveKycRecord(input);
  };

  const rejectKycRecord = auth.rejectKycRecord.bind(auth);
  auth.rejectKycRecord = async (input) => {
    refuseOnWire({ actorId: input.reviewerId, confirmActorId: readConfirm(input) });
    return rejectKycRecord(input);
  };
}

/** Affiliate freeze/unfreeze is an operator mutate — same dual-control bar. */
export function installFreezeDualControl(freeze: FreezeService): void {
  const tagged = freeze as FreezeService & { [FREEZE_FLAG]?: true };
  if (tagged[FREEZE_FLAG]) return;
  tagged[FREEZE_FLAG] = true;

  const origFreeze = freeze.freeze.bind(freeze);
  freeze.freeze = async (input) => {
    refuseOnWire({ actorId: input.frozenBy, confirmActorId: readConfirm(input) });
    return origFreeze(input);
  };

  const origUnfreeze = freeze.unfreeze.bind(freeze);
  freeze.unfreeze = async (beneficiaryId: string, cmd?: DualControlCmd) => {
    refuseOnWire(cmd);
    return origUnfreeze(beneficiaryId);
  };
}

export { DUAL_CONTROL_MISSING, DUAL_CONTROL_MISSING_MESSAGE };
