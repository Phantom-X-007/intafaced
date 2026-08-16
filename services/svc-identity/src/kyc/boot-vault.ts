import type { Sql } from 'postgres';
import { parseKycDocKey } from './document-crypto.js';
import { KycDocumentError, KycDocumentStore, type KycDocumentVault } from './document-store.js';
import { bindProviderRefToDocument, type BindProviderRefInput, type BindProviderRefResult } from './provider-ref-bind.js';

export type KycVaultBoot = {
  kycDocs: KycDocumentVault;
  bindKycProviderRef: (input: BindProviderRefInput) => Promise<BindProviderRefResult>;
};

/** Residual id when IDENTITY_KYC_DOC_KEY is unset — procedures refuse closed, never invent a store. */
export const KYC_VAULT_UNWIRED = 'kyc_doc.unwired';

function keyMaterialPresent(keyMaterial: string | undefined): boolean {
  return Boolean(keyMaterial?.trim());
}

/**
 * Wire the §10 vault for createIdentityRouter when IDENTITY_KYC_DOC_KEY is set.
 *
 * - unset / blank → null (router named-refuses `[kyc_doc.unwired]`; never invent a key)
 * - set but not 32-byte base64/hex → named `kyc_doc.key_missing` (not a silent missing store)
 * - valid 32-byte key → vault + bind
 *
 * Production index.ts:
 *   const kycBoot = kycRouterBootOptions(sql, env.IDENTITY_KYC_DOC_KEY);
 *   createIdentityRouter(auth, rank, { …, ...kycBoot })
 */
export function bootKycVault(sql: Sql, keyMaterial: string | undefined): KycVaultBoot | null {
  const parsed = parseKycDocKey(keyMaterial);
  if (keyMaterialPresent(keyMaterial) && !parsed) {
    throw new KycDocumentError('IDENTITY_KYC_DOC_KEY is set but is not a 32-byte key (base64 or hex)', 'kyc_doc.key_missing');
  }
  if (!parsed) return null;
  const kycDocs = new KycDocumentStore(sql, keyMaterial);
  return {
    kycDocs,
    bindKycProviderRef: (input) => bindProviderRefToDocument(sql, kycDocs, input),
  };
}

/**
 * Router options fragment for production boot.
 * Key set → always includes kycDocs (or throws). Key unset → empty object (no silent store).
 */
export function kycRouterBootOptions(sql: Sql, keyMaterial: string | undefined): Partial<KycVaultBoot> {
  const vault = bootKycVault(sql, keyMaterial);
  if (!vault) return {};
  return {
    kycDocs: vault.kycDocs,
    bindKycProviderRef: vault.bindKycProviderRef,
  };
}
