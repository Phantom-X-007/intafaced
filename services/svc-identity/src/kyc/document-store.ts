import type { Sql } from 'postgres';
import { decryptDocument, encryptDocument, parseKycDocKey } from './document-crypto.js';

export class KycDocumentError extends Error {
  constructor(
    message: string,
    readonly code:
      'kyc_doc.key_missing' | 'kyc_doc.too_large' | 'kyc_doc.not_found' | 'kyc_doc.decrypt_failed' | 'kyc_doc.bad_content_type',
  ) {
    super(message);
    this.name = 'KycDocumentError';
  }
}

const MAX_BYTES = 10 * 1024 * 1024;

export type PutDocumentInput = {
  userId: string;
  contentType: string;
  bytes: Buffer;
};

export type StoredDocumentMeta = {
  id: string;
  userId: string;
  contentType: string;
  byteLength: number;
  createdAt: Date;
};

/**
 * §10 encrypted KYC document store (mechanism).
 *
 * - Bytes live only in identity.kyc_documents (ciphertext).
 * - Opaque id is what kyc_records.provider_ref may point at later.
 * - kyc.status / public API never returns bytes (no read procedure mounted).
 * - Live vendor webhook is Class X — not this module.
 */
export class KycDocumentStore {
  constructor(
    private readonly sql: Sql,
    private readonly keyMaterial: string | undefined,
    private readonly keyId = 'v1',
  ) {}

  private requireKey(): Buffer {
    const key = parseKycDocKey(this.keyMaterial);
    if (!key) {
      throw new KycDocumentError('IDENTITY_KYC_DOC_KEY is not set to a 32-byte key (base64 or hex)', 'kyc_doc.key_missing');
    }
    return key;
  }

  async put(input: PutDocumentInput): Promise<StoredDocumentMeta> {
    if (!input.contentType || input.contentType.length > 128 || /[\r\n]/.test(input.contentType)) {
      throw new KycDocumentError('Invalid content type', 'kyc_doc.bad_content_type');
    }
    if (input.bytes.length === 0 || input.bytes.length > MAX_BYTES) {
      throw new KycDocumentError(`Document must be 1..${MAX_BYTES} bytes`, 'kyc_doc.too_large');
    }
    const key = this.requireKey();
    const { ciphertext, nonce } = encryptDocument(key, input.bytes);

    const rows = await this.sql<Array<{ id: string; user_id: string; content_type: string; byte_length: number; created_at: Date }>>`
      INSERT INTO kyc_documents (user_id, content_type, byte_length, ciphertext, nonce, key_id)
      VALUES (
        ${input.userId},
        ${input.contentType},
        ${input.bytes.length},
        ${ciphertext},
        ${nonce},
        ${this.keyId}
      )
      RETURNING id, user_id, content_type, byte_length, created_at
    `;
    const row = rows[0]!;
    return {
      id: row.id,
      userId: row.user_id,
      contentType: row.content_type,
      byteLength: row.byte_length,
      createdAt: row.created_at,
    };
  }

  /** Operator/tooling read path only — never mount on user-facing KYC status. */
  async get(id: string): Promise<{ meta: StoredDocumentMeta; bytes: Buffer }> {
    const key = this.requireKey();
    const rows = await this.sql<
      Array<{
        id: string;
        user_id: string;
        content_type: string;
        byte_length: number;
        ciphertext: Buffer;
        nonce: Buffer;
        created_at: Date;
      }>
    >`
      SELECT id, user_id, content_type, byte_length, ciphertext, nonce, created_at
        FROM kyc_documents WHERE id = ${id}
    `;
    const row = rows[0];
    if (!row) throw new KycDocumentError('Document not found', 'kyc_doc.not_found');
    try {
      const bytes = decryptDocument(key, Buffer.from(row.ciphertext), Buffer.from(row.nonce));
      return {
        meta: {
          id: row.id,
          userId: row.user_id,
          contentType: row.content_type,
          byteLength: row.byte_length,
          createdAt: row.created_at,
        },
        bytes,
      };
    } catch {
      throw new KycDocumentError('Document decrypt failed', 'kyc_doc.decrypt_failed');
    }
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.sql<Array<{ id: string }>>`
      DELETE FROM kyc_documents WHERE id = ${id} RETURNING id
    `;
    return rows.length > 0;
  }
}
