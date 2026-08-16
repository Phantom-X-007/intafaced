/**
 * Unit card — compose stack passes access-token TTL / issuer / audience into svc-notify
 *
 * 1. Promise: host `.env` can pin token life and iss/aud for notify
 *    (authEnvSchema already defaults 900 / intafaced / intafaced.api).
 * 2. Break: compose booted notify with *edge-secret + fan-out/gateway/verify-TTL
 *    but no TTL/iss/aud → operator pin is a no-op and the container keeps the
 *    schema-only defaults forever.
 * 3. Done bar: docker-compose.apps.yml svc-notify has
 *    JWT_ACCESS_TTL_SECONDS: ${JWT_ACCESS_TTL_SECONDS:-900}
 *    JWT_ISSUER: ${JWT_ISSUER:-intafaced}
 *    JWT_AUDIENCE: ${JWT_AUDIENCE:-intafaced.api}.
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-notify block only)
 * 6. RED: pin fails if a line drops, is duplicated in the notify block, or the
 *    compose default is not 900 / intafaced / intafaced.api
 * 7. Collision: fan-out / out-of-app / gateway / required-channels / verify-TTL /
 *    SMS max / delivery attempts / TRADE_URL pins — this pin does not restamp
 *    those keys and does not add JWT_ACCESS_SECRET
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const COMPOSE = resolve(import.meta.dirname, '../../../docker-compose.apps.yml');
const AUTH_ENV = resolve(import.meta.dirname, '../../../packages/config/src/env.ts');

function notifyServiceBlock(source: string): string {
  const match = source.match(/^  svc-notify:\n(?:.*\n)*?(?=^  [a-z]|\Z)/m);
  if (!match) throw new Error('svc-notify service block missing from docker-compose.apps.yml');
  return match[0];
}

function countAssignments(source: string, name: string): number {
  const re = new RegExp(`^\\s*${name}:`, 'gm');
  return source.match(re)?.length ?? 0;
}

const TTL = /^\s+JWT_ACCESS_TTL_SECONDS:\s*\$\{JWT_ACCESS_TTL_SECONDS:-900\}\s*$/gm;
const ISSUER = /^\s+JWT_ISSUER:\s*\$\{JWT_ISSUER:-intafaced\}\s*$/gm;
const AUDIENCE = /^\s+JWT_AUDIENCE:\s*\$\{JWT_AUDIENCE:-intafaced\.api\}\s*$/gm;

describe('compose JWT access TTL / issuer / audience for svc-notify', () => {
  const compose = readFileSync(COMPOSE, 'utf8');
  const authEnv = readFileSync(AUTH_ENV, 'utf8');
  const block = notifyServiceBlock(compose);

  it('authEnvSchema still defaults TTL 900, issuer intafaced, audience intafaced.api', () => {
    expect(authEnv).toMatch(/JWT_ACCESS_TTL_SECONDS:\s*z\.coerce\.number\(\)\.int\(\)\.min\(60\)\.max\(3600\)\.default\(900\)/);
    expect(authEnv).toMatch(/JWT_ISSUER:\s*z\.string\(\)\.default\('intafaced'\)/);
    expect(authEnv).toMatch(/JWT_AUDIENCE:\s*z\.string\(\)\.default\('intafaced\.api'\)/);
  });

  it('wires svc-notify JWT_ACCESS_TTL_SECONDS JWT_ISSUER JWT_AUDIENCE from the host, unique once', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-notify/);
    expect(block.match(TTL)).toHaveLength(1);
    expect(block.match(ISSUER)).toHaveLength(1);
    expect(block.match(AUDIENCE)).toHaveLength(1);
    expect(countAssignments(block, 'JWT_ACCESS_TTL_SECONDS')).toBe(1);
    expect(countAssignments(block, 'JWT_ISSUER')).toBe(1);
    expect(countAssignments(block, 'JWT_AUDIENCE')).toBe(1);
  });

  it('does not restamp fan-out out-of-app gateways required-channels verify-TTL SMS max delivery TRADE_URL or invent JWT_ACCESS_SECRET', () => {
    expect(block).toMatch(/NOTIFY_FANOUT_ENABLED:\s*\$\{NOTIFY_FANOUT_ENABLED:-true\}/);
    expect(block).toMatch(/NOTIFY_OUT_OF_APP_ENABLED:\s*\$\{NOTIFY_OUT_OF_APP_ENABLED:-true\}/);
    expect(block).toMatch(/NOTIFY_EMAIL_GATEWAY_URL:\s*\$\{NOTIFY_EMAIL_GATEWAY_URL:-\}/);
    expect(block).toMatch(/NOTIFY_EMAIL_GATEWAY_TOKEN:\s*\$\{NOTIFY_EMAIL_GATEWAY_TOKEN:-\}/);
    expect(block).toMatch(/NOTIFY_PUSH_GATEWAY_URL:\s*\$\{NOTIFY_PUSH_GATEWAY_URL:-\}/);
    expect(block).toMatch(/NOTIFY_PUSH_GATEWAY_TOKEN:\s*\$\{NOTIFY_PUSH_GATEWAY_TOKEN:-\}/);
    expect(block).toMatch(/NOTIFY_SMS_GATEWAY_URL:\s*\$\{NOTIFY_SMS_GATEWAY_URL:-\}/);
    expect(block).toMatch(/NOTIFY_SMS_GATEWAY_TOKEN:\s*\$\{NOTIFY_SMS_GATEWAY_TOKEN:-\}/);
    expect(block).toMatch(/NOTIFY_REQUIRED_CHANNELS:\s*\$\{NOTIFY_REQUIRED_CHANNELS:-\}/);
    expect(block).toMatch(/NOTIFY_MAX_DELIVERY_ATTEMPTS:\s*\$\{NOTIFY_MAX_DELIVERY_ATTEMPTS:-3\}/);
    expect(block).toMatch(/NOTIFY_GATEWAY_TIMEOUT_MS:\s*\$\{NOTIFY_GATEWAY_TIMEOUT_MS:-5000\}/);
    expect(block).toMatch(/NOTIFY_SMS_MAX_CHARS:\s*\$\{NOTIFY_SMS_MAX_CHARS:-480\}/);
    expect(block).toMatch(/NOTIFY_VERIFY_TTL_MINUTES:\s*\$\{NOTIFY_VERIFY_TTL_MINUTES:-15\}/);
    expect(block).toMatch(/TRADE_URL:\s*http:\/\/svc-trade:4004/);
    expect(countAssignments(block, 'NOTIFY_FANOUT_ENABLED')).toBe(1);
    expect(countAssignments(block, 'NOTIFY_OUT_OF_APP_ENABLED')).toBe(1);
    expect(countAssignments(block, 'NOTIFY_EMAIL_GATEWAY_URL')).toBe(1);
    expect(countAssignments(block, 'NOTIFY_EMAIL_GATEWAY_TOKEN')).toBe(1);
    expect(countAssignments(block, 'NOTIFY_PUSH_GATEWAY_URL')).toBe(1);
    expect(countAssignments(block, 'NOTIFY_PUSH_GATEWAY_TOKEN')).toBe(1);
    expect(countAssignments(block, 'NOTIFY_SMS_GATEWAY_URL')).toBe(1);
    expect(countAssignments(block, 'NOTIFY_SMS_GATEWAY_TOKEN')).toBe(1);
    expect(countAssignments(block, 'NOTIFY_REQUIRED_CHANNELS')).toBe(1);
    expect(countAssignments(block, 'NOTIFY_MAX_DELIVERY_ATTEMPTS')).toBe(1);
    expect(countAssignments(block, 'NOTIFY_GATEWAY_TIMEOUT_MS')).toBe(1);
    expect(countAssignments(block, 'NOTIFY_SMS_MAX_CHARS')).toBe(1);
    expect(countAssignments(block, 'NOTIFY_VERIFY_TTL_MINUTES')).toBe(1);
    expect(countAssignments(block, 'TRADE_URL')).toBe(1);
    expect(countAssignments(block, 'JWT_ACCESS_SECRET')).toBe(0);
  });
});
