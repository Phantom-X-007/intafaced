import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const indexSrc = () => readFileSync(join(here, 'index.ts'), 'utf8');

describe('connect-data-lake package exports mount', () => {
  it('exports batch ingest + persistence gate symbols', () => {
    const src = indexSrc();
    expect(src).toContain('ingestCaptureLakeBatch');
    expect(src).toContain('describeIngestCaptureLakeBatch');
    expect(src).toContain('flushCaptureLogToPersistenceSink');
    expect(src).toContain('retentionPersistenceGate');
  });
});
