import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const BANNED_KYC_RECORD_COLUMNS = [
  'document_bytes',
  'document_data',
  'id_image',
  'passport',
  'selfie',
  'full_name',
  'date_of_birth',
  'national_id',
];

describe('PII isolation gate (kyc_records)', () => {
  it('forbids document/PII columns on kyc_records in schema', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const root = join(here, '../..');
    const schema = readFileSync(join(root, 'src/db/schema.ts'), 'utf8');
    const start = schema.indexOf('export const kycRecords');
    const end = schema.indexOf('export const rankState', start);
    const block = schema.slice(start, end === -1 ? undefined : end).toLowerCase();
    for (const col of BANNED_KYC_RECORD_COLUMNS) {
      expect(block, `kyc_records must not define ${col}`).not.toMatch(new RegExp(`['"\`]${col}['"\`]|\\b${col}:`));
    }
  });

  it('document store table keeps ciphertext not plaintext columns', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const sql = readFileSync(join(here, '../../drizzle/0010_kyc_document_store.sql'), 'utf8').toLowerCase();
    expect(sql).toContain('ciphertext');
    expect(sql).toContain('nonce');
    expect(sql).not.toMatch(/\bplaintext\b/);
    expect(sql).not.toMatch(/\bdocument_text\b/);
  });
});
