import { describe, expect, it } from 'vitest';
import { consoleCopy } from './console-copy';

/**
 * Missing keys must not invent English. The catalog is the only source of
 * operator copy; an unknown key renders itself so the miss is greppable.
 */
describe('consoleCopy — catalog keys, never invented English', () => {
  it('resolves a known admin.console key from @intafaced/i18n', () => {
    expect(consoleCopy('admin.console.banner.chip.none')).toBe('Cannot halt anything');
  });

  it('renders the key name when the key is not in the catalog', () => {
    const missing = 'admin.console.this.key.does.not.exist';
    const rendered = consoleCopy(missing);

    expect(rendered).toBe(missing);
    expect(rendered).not.toMatch(/cannot halt|unconfigured|please set|control plane/i);
  });
});
