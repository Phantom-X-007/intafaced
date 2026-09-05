/**
 * Unit card — MinIO + academy video env default OFF
 *
 * 1. Promise: object storage is opt-in; blank env is academy.video_storage_unconfigured
 * 2. Break: compose starts MinIO on every up, or academy inherits a default endpoint
 * 3. Done bar: academy-minio has profiles academy-video; svc-academy keys default empty
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml + env.ts + this pin
 * 6. RED: minio lacks profiles, or endpoint defaults to a URL
 * 7. Collision: do not restamp STREAM_PROVIDER / paper / tournament keys
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function serviceBlock(source: string, name: string): string {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start < 0) throw new Error(`${name} service block missing from docker-compose.apps.yml`);
  const block = [lines[start]];
  for (const line of lines.slice(start + 1)) {
    if (/^  [A-Za-z0-9_-]+:/.test(line)) break;
    block.push(line);
  }
  return block.join('\n');
}

describe('compose academy video storage default off', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const envTs = readFileSync(join(ROOT, 'services/svc-academy/src/env.ts'), 'utf8');
  const academy = serviceBlock(compose, 'svc-academy');
  const minio = serviceBlock(compose, 'academy-minio');

  it('env.ts defaults S3 endpoint empty (unconfigured refuse)', () => {
    expect(envTs).toMatch(/ACADEMY_VIDEO_S3_ENDPOINT:\s*z\.string\(\)\.optional\(\)\.default\(''\)/);
    expect(envTs).toMatch(/ACADEMY_VIDEO_S3_BUCKET:\s*z\.string\(\)\.optional\(\)\.default\(''\)/);
    expect(envTs).toMatch(/ACADEMY_VIDEO_S3_ACCESS_KEY:\s*z\.string\(\)\.optional\(\)\.default\(''\)/);
    expect(envTs).toMatch(/ACADEMY_VIDEO_S3_SECRET_KEY:\s*z\.string\(\)\.optional\(\)\.default\(''\)/);
    expect(envTs).toMatch(/ACADEMY_VIDEO_S3_REGION:\s*z\.string\(\)\.optional\(\)\.default\(''\)/);
    expect(envTs).toMatch(/ACADEMY_VIDEO_MIN_TIER:\s*z\.string\(\)\.optional\(\)\.default\(''\)/);
    expect(envTs).toMatch(/ACADEMY_VIDEO_MIN_STAKE:\s*z\.string\(\)\.optional\(\)\.default\(''\)/);
  });

  it('svc-academy compose passes video env with empty defaults', () => {
    expect(academy).toMatch(/SERVICE_NAME:\s*svc-academy/);
    expect(academy).toMatch(/ACADEMY_VIDEO_S3_ENDPOINT:\s*\$\{ACADEMY_VIDEO_S3_ENDPOINT:-\}/);
    expect(academy).toMatch(/ACADEMY_VIDEO_S3_BUCKET:\s*\$\{ACADEMY_VIDEO_S3_BUCKET:-\}/);
    expect(academy).toMatch(/ACADEMY_VIDEO_S3_REGION:\s*\$\{ACADEMY_VIDEO_S3_REGION:-\}/);
    expect(academy).not.toMatch(/ACADEMY_VIDEO_S3_ENDPOINT:\s*\$\{ACADEMY_VIDEO_S3_ENDPOINT:-https?:/);
    expect(academy).not.toMatch(/ACADEMY_VIDEO_S3_REGION:\s*\$\{ACADEMY_VIDEO_S3_REGION:-us-east-1\}/);
  });

  it('academy-minio is profile-gated default off — not LiveKit', () => {
    expect(minio).toMatch(/profiles:\s*\['academy-video'\]/);
    expect(minio).toMatch(/minio\/minio:/);
    expect(minio).not.toMatch(/(?:image|command):.*livekit/i);
  });
});
