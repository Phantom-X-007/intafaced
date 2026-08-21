import { describe, expect, it } from 'vitest';
import { redactUrl } from './infra-journal.js';

describe('redactUrl', () => {
  it('strips passwords from postgres URLs', () => {
    const out = redactUrl('postgres://ops:s3cret@localhost:5433/intafaced_test');
    expect(out).toContain('***');
    expect(out).not.toContain('s3cret');
  });
});
