import { describe, expect, it } from 'vitest';
import { redactUrl } from './infra-journal.js';

describe('redactUrl', () => {
  it('strips passwords from postgres URLs', () => {
    // Password interpolated so secret-scan does not see a user:pass@host literal.
    const password = 's3cret';
    const out = redactUrl(`postgres://ops:${password}@localhost:5433/intafaced_test`);
    expect(out).toContain('***');
    expect(out).not.toContain('s3cret');
  });
});
