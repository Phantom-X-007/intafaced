import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const compose = readFileSync(resolve(import.meta.dirname, '../../../../docker-compose.apps.yml'), 'utf8');

describe('LiveKit compose wiring', () => {
  it('ships a LiveKit service while keeping blank academy provider mode refuse-closed', () => {
    expect(compose).toMatch(/livekit:\n\s+image:\s+livekit\/livekit-server:/);
    expect(compose).toMatch(/ACADEMY_STREAM_PROVIDER: \$\{ACADEMY_STREAM_PROVIDER:-none\}/);
    expect(compose).toMatch(/LIVEKIT_URL: \$\{LIVEKIT_URL:-\}/);
  });
});
