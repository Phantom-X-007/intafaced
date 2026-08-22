import { describe, expect, it } from 'vitest';
import { adminBffSecretComposeWired } from './admin-compose-wiring.js';

describe('ops.admin fleet compose wiring', () => {
  it('names ADMIN_BFF_SHARED_SECRET in compose (optional pass-through)', () => {
    expect(adminBffSecretComposeWired()).toBe(true);
  });
});
