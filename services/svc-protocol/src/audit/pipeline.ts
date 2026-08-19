/**
 * S-J1 audit pipeline — status, artefact hash, who signed.
 *
 * `audited:true` is a sale/UI flag. It is unreachable unless the claim is
 * `kind: 'external'`, a named signer exists, and `expectedHash` matches the
 * package bytes. An internal threat-model markdown is a package, not an audit.
 * Closing `socket.contract-audit` still needs a Nitro-paid firm.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type AuditKind = 'none' | 'internal' | 'external';

export type PackageClaim = {
  readonly id: string;
  readonly packagePath: string;
  readonly kind: AuditKind;
  readonly signedBy: string | null;
  readonly signedAt: string | null;
  /** Pinned sha256 of the package file. Required for `kind: 'external'`. */
  readonly expectedHash?: `0x${string}`;
};

export type AuditRecord = {
  readonly id: string;
  readonly kind: AuditKind;
  readonly packagePath: string;
  readonly artifactHash: `0x${string}`;
  readonly signedBy: string | null;
  readonly signedAt: string | null;
  readonly audited: boolean;
};

export type InternalAuditRecord = AuditRecord & { readonly kind: 'internal'; readonly audited: false };

export function hashPackageContents(contents: string): `0x${string}` {
  const normalised = contents.replace(/\r\n/g, '\n');
  return `0x${createHash('sha256').update(normalised, 'utf8').digest('hex')}`;
}

export function evaluatePackage(claim: PackageClaim, contents: string): AuditRecord {
  const artifactHash = hashPackageContents(contents);
  const empty = contents.trim() === '';

  if (claim.kind === 'none' || empty) {
    return {
      id: claim.id,
      kind: 'none',
      packagePath: claim.packagePath,
      artifactHash,
      signedBy: null,
      signedAt: null,
      audited: false,
    };
  }

  if (claim.kind === 'internal') {
    return {
      id: claim.id,
      kind: 'internal',
      packagePath: claim.packagePath,
      artifactHash,
      signedBy: claim.signedBy,
      signedAt: claim.signedAt,
      audited: false,
    };
  }

  // External: signer + pinned hash that matches bytes. Anything else is not an audit.
  const externalOk = Boolean(claim.signedBy && claim.expectedHash && claim.expectedHash === artifactHash);
  return {
    id: claim.id,
    kind: externalOk ? 'external' : 'none',
    packagePath: claim.packagePath,
    artifactHash,
    signedBy: claim.signedBy,
    signedAt: claim.signedAt,
    audited: externalOk,
  };
}

/** Committed internal package. Never `audited:true`. */
export const INTERNAL_SMART_ACCOUNTS: PackageClaim = {
  id: 'protocol-smart-accounts',
  packagePath: 'docs/audits/protocol-smart-accounts-2026-08-08.md',
  kind: 'internal',
  signedBy: 'shehzad002',
  signedAt: '2026-08-08T00:00:00.000Z',
};

function repoRootFromThisFile(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../../..');
}

export function loadInternalSmartAccountsPackage(root: string = repoRootFromThisFile()): InternalAuditRecord {
  const contents = readFileSync(join(root, INTERNAL_SMART_ACCOUNTS.packagePath), 'utf8');
  const record = evaluatePackage(INTERNAL_SMART_ACCOUNTS, contents);
  if (record.kind !== 'internal' || record.audited !== false) {
    throw new Error('internal smart-accounts package must evaluate to kind=internal audited=false');
  }
  return {
    id: record.id,
    kind: 'internal',
    packagePath: record.packagePath,
    artifactHash: record.artifactHash,
    signedBy: record.signedBy,
    signedAt: record.signedAt,
    audited: false,
  };
}
