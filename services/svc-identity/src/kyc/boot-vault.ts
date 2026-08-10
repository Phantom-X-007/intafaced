import type { Sql } from 'postgres';
import { parseKycDocKey } from './document-crypto.js';
import { KycDocumentStore, type KycDocumentVault } from './document-store.js';
import { bindProviderRefToDocument, type BindProviderRefInput, type BindProviderRefResult } from './provider-ref-bind.js';

export type KycVaultBoot = {
  kycDocs: KycDocumentVault;
  bindKycProviderRef: (input: BindProviderRefInput) => Promise<BindProviderRefResult>;
};

/**
 * Wire the §10 vault for createIdentityRouter when IDENTITY_KYC_DOC_KEY is set.
 * Missing/invalid key → null (procedures refuse closed; never invent a key).
 *
 * Intended for index.ts after Denon dual-write paths clear:
 *   const vault = bootKycVault(sql, env.IDENTITY_KYC_DOC_KEY);
 *   createIdentityRouter(auth, rank, { …, ...vault })
 */
export function bootKycVault(sql: Sql, keyMaterial: string | undefined): KycVaultBoot | null {
  if (!parseKycDocKey(keyMaterial)) return null;
  const kycDocs = new KycDocumentStore(sql, keyMaterial);
  return {
    kycDocs,
    bindKycProviderRef: (input) => bindProviderRefToDocument(sql, kycDocs, input),
  };
}
