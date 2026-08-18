/**
 * Unit card — SMS default cap is three GSM segments
 * 1. Promise: README NOTIFY_SMS_MAX_CHARS default 480
 * 2. Break: unbounded body = unbounded bill
 * 3. Done bar: DEFAULT_SMS_MAX_CHARS === 480
 * 4. Class N
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_SMS_MAX_CHARS } from './channels/registry.js';

describe('SMS max chars default pin', () => {
  it('defaults to 480 (three GSM segments)', () => {
    expect(DEFAULT_SMS_MAX_CHARS).toBe(480);
  });
});
