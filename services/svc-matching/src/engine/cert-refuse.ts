/**
 * Cert / testnet-parity refuse (PX-S03 / PTX-M19-R01 / PTX-M19-R03 / PTX-M00-R06).
 * Certified / testnet-parity claims refuse without MATCHING_RULEBOOK_VERSION and an owner program.
 * Do not fake a cert suite. Do not invent a version. Blank is unpublished, never v1/latest/GTC.
 * Hitch: imported from index.ts so MatchingEngine is wrapped without recutting engine.ts.
 */
import { MatchingEngine } from './engine.js';

export const CERTIFIED_UNPUBLISHED = 'certified_unpublished' as const;
export const TESTNET_PARITY_UNPUBLISHED = 'testnet_parity_unpublished' as const;
export const CERT_PROGRAM_UNSET = 'cert_program_unset' as const;

export const CERTIFIED_UNPUBLISHED_MESSAGE =
  'certified claim refuses without a published MATCHING_RULEBOOK_VERSION; matching does not invent a version';
export const TESTNET_PARITY_UNPUBLISHED_MESSAGE =
  'testnet parity claim refuses without a published MATCHING_RULEBOOK_VERSION; matching does not invent a version';
export const CERT_PROGRAM_UNSET_MESSAGE =
  'certified / testnet-parity claim refuses without an owner program; matching does not fake a cert suite';

const FLAG = Symbol.for('intafaced.matching.cert-refuse');

export type CertClaimInput = {
  readonly rulebookVersion?: string | null;
  readonly program?: string | null;
};

export type CertRefuseCode = typeof CERTIFIED_UNPUBLISHED | typeof TESTNET_PARITY_UNPUBLISHED | typeof CERT_PROGRAM_UNSET;

export type CertRefuseReason = {
  readonly code: CertRefuseCode;
  readonly message: string;
};

export type CertClaimRefused = {
  readonly accepted: false;
  readonly unpublished: boolean;
  readonly suite: null;
  readonly rulebookVersion?: string;
  readonly rejected: CertRefuseReason;
};

export type CertClaimPublished = {
  readonly accepted: true;
  readonly unpublished: false;
  readonly rulebookVersion: string;
  readonly program: string;
  readonly suite: null;
};

export type CertClaimResult = CertClaimRefused | CertClaimPublished;

/** Owner-published name, or null. Blank/whitespace is unpublished — never mapped to v1, latest, or GTC. */
export function publishedName(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function certifiedUnpublishedRefuse(): CertRefuseReason {
  return { code: CERTIFIED_UNPUBLISHED, message: CERTIFIED_UNPUBLISHED_MESSAGE };
}

export function testnetParityUnpublishedRefuse(): CertRefuseReason {
  return { code: TESTNET_PARITY_UNPUBLISHED, message: TESTNET_PARITY_UNPUBLISHED_MESSAGE };
}

export function certProgramUnsetRefuse(): CertRefuseReason {
  return { code: CERT_PROGRAM_UNSET, message: CERT_PROGRAM_UNSET_MESSAGE };
}

function unpublishedRefuse(kind: 'certified' | 'testnetParity'): CertRefuseReason {
  return kind === 'certified' ? certifiedUnpublishedRefuse() : testnetParityUnpublishedRefuse();
}

function claim(kind: 'certified' | 'testnetParity', input: CertClaimInput = {}): CertClaimResult {
  const version = publishedName(input.rulebookVersion);
  if (version === null) {
    return {
      accepted: false,
      unpublished: true,
      suite: null,
      rejected: unpublishedRefuse(kind),
    };
  }
  const program = publishedName(input.program);
  if (program === null) {
    return {
      accepted: false,
      unpublished: false,
      rulebookVersion: version,
      suite: null,
      rejected: certProgramUnsetRefuse(),
    };
  }
  return {
    accepted: true,
    unpublished: false,
    rulebookVersion: version,
    program,
    suite: null,
  };
}

export function claimCertified(input: CertClaimInput = {}): CertClaimResult {
  return claim('certified', input);
}

export function claimTestnetParity(input: CertClaimInput = {}): CertClaimResult {
  return claim('testnetParity', input);
}

export function installCertRefuse(ctor: typeof MatchingEngine = MatchingEngine): void {
  const proto = ctor.prototype as {
    claimCertified?: (input?: CertClaimInput) => CertClaimResult;
    claimTestnetParity?: (input?: CertClaimInput) => CertClaimResult;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  proto.claimCertified = function (this: MatchingEngine, input: CertClaimInput = {}) {
    return claimCertified(input);
  };

  proto.claimTestnetParity = function (this: MatchingEngine, input: CertClaimInput = {}) {
    return claimTestnetParity(input);
  };
}

try {
  installCertRefuse();
} catch {
  queueMicrotask(() => installCertRefuse());
}
