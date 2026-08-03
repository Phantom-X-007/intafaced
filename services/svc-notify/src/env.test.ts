import { beforeAll, describe, expect, it } from 'vitest';

/**
 * BOOT REFUSAL — the half of "the channel refuses honestly" that honesty alone
 * does not cover.
 *
 * A channel with no credentials records a refusal on every message. That is the
 * right behaviour and it is not sufficient: nobody reads `notify.deliveries`
 * until somebody complains, so a production deployment whose SMS gateway was
 * never wired looks healthy for exactly as long as it takes a borrower to be
 * liquidated without warning.
 *
 * So an operator states what the deployment depends on, and the absence of a
 * credential for a declared-required channel STOPS THE BOOT. The model is
 * `EDGE_PRINCIPAL_SECRET` in `@intafaced/config`: no default, no fallback, the
 * process does not start.
 *
 * These tests exercise the schema, not a running process, because the whole
 * point is the state that must never reach a running process.
 */

/** Never connected to. `*_test` per the test-db scan; this suite opens no socket. */
const BASE = {
  DATABASE_URL: 'postgres://svc_notify:svc_notify@localhost:5432/intafaced_notify_test',
  EDGE_PRINCIPAL_SECRET: 'e'.repeat(40),
  SERVICE_NAME: 'svc-notify',
};

const CREDS = {
  NOTIFY_SMS_GATEWAY_URL: 'https://gateway.internal/sms',
  NOTIFY_SMS_GATEWAY_TOKEN: 's'.repeat(24),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let envSchema: any;

beforeAll(async () => {
  // The module parses `process.env` at import time — deliberately, that is what
  // "fatal at boot" means — so it needs a loadable environment to import at all.
  Object.assign(process.env, BASE);
  ({ envSchema } = await import('./env.js'));
});

function parse(over: Record<string, string>) {
  return envSchema.safeParse({ ...BASE, ...over });
}

function messages(result: { success: boolean; error?: { issues: Array<{ message: string }> } }): string {
  return result.error?.issues.map((i) => i.message).join('\n') ?? '';
}

describe('dev and test stay frictionless', () => {
  it('boots with no gateway credentials at all', () => {
    expect(parse({ APP_ENV: 'dev' }).success).toBe(true);
    expect(parse({ APP_ENV: 'test' }).success).toBe(true);
  });

  it('boots with NOTIFY_REQUIRED_CHANNELS unset — nobody needs an SMS provider to run a unit test', () => {
    const result = parse({ APP_ENV: 'dev' });
    expect(result.success).toBe(true);
    expect(result.data.NOTIFY_REQUIRED_CHANNELS).toBeUndefined();
  });
});

describe('an enforced environment must state what it depends on', () => {
  for (const APP_ENV of ['staging', 'prod']) {
    it(`refuses to boot in ${APP_ENV} with NOTIFY_REQUIRED_CHANNELS unset`, () => {
      const result = parse({ APP_ENV });
      expect(result.success).toBe(false);
      expect(messages(result)).toMatch(/must state which out-of-app channels/);
    });
  }

  it('accepts `none` — "in-app only, on purpose" is a decision and may be recorded as one', () => {
    expect(parse({ APP_ENV: 'prod', NOTIFY_REQUIRED_CHANNELS: 'none' }).success).toBe(true);
  });

  it('does not accept an empty string as a statement — compose interpolates an unset variable to ""', () => {
    const result = parse({ APP_ENV: 'prod', NOTIFY_REQUIRED_CHANNELS: '' });
    expect(result.success).toBe(false);
    expect(messages(result)).toMatch(/must state which out-of-app channels/);
  });

  it('treats an empty gateway URL as not wired rather than as a malformed URL', () => {
    // Without this the compose passthrough would take the service down instead
    // of leaving the channel honestly unconfigured.
    const result = parse({ APP_ENV: 'dev', NOTIFY_EMAIL_GATEWAY_URL: '', NOTIFY_EMAIL_GATEWAY_TOKEN: '' });
    expect(result.success).toBe(true);
    expect(result.data.NOTIFY_EMAIL_GATEWAY_URL).toBeUndefined();
  });

  it('rejects a channel name that does not exist rather than silently requiring nothing', () => {
    const result = parse({ APP_ENV: 'prod', NOTIFY_REQUIRED_CHANNELS: 'email,telegraph' });
    expect(result.success).toBe(false);
    expect(messages(result)).toMatch(/unknown channel\(s\): telegraph/);
  });
});

describe('a required channel with no credentials is fatal, and says which variable is missing', () => {
  it('refuses when both variables are absent', () => {
    const result = parse({ APP_ENV: 'prod', NOTIFY_REQUIRED_CHANNELS: 'sms' });
    expect(result.success).toBe(false);
    // The message is an ops instruction: it must name the variables verbatim.
    expect(messages(result)).toContain('NOTIFY_SMS_GATEWAY_URL');
    expect(messages(result)).toContain('NOTIFY_SMS_GATEWAY_TOKEN');
  });

  it('refuses when only the token is absent', () => {
    const result = parse({ APP_ENV: 'prod', NOTIFY_REQUIRED_CHANNELS: 'sms', NOTIFY_SMS_GATEWAY_URL: CREDS.NOTIFY_SMS_GATEWAY_URL });
    expect(result.success).toBe(false);
    expect(messages(result)).toContain('NOTIFY_SMS_GATEWAY_TOKEN');
  });

  it('boots once the pair is set', () => {
    expect(parse({ APP_ENV: 'prod', NOTIFY_REQUIRED_CHANNELS: 'sms', ...CREDS }).success).toBe(true);
  });

  it('still refuses a URL without a token even when the channel is not required — an open relay is an open relay', () => {
    const result = parse({ APP_ENV: 'dev', NOTIFY_EMAIL_GATEWAY_URL: 'https://gateway.internal/email' });
    expect(result.success).toBe(false);
    expect(messages(result)).toMatch(/open relay/);
  });
});

describe('the two settings may not disagree about whether messages go out', () => {
  it('refuses a deployment that requires a channel and switches all sending off', () => {
    const result = parse({ APP_ENV: 'prod', NOTIFY_REQUIRED_CHANNELS: 'sms', NOTIFY_OUT_OF_APP_ENABLED: 'false', ...CREDS });
    expect(result.success).toBe(false);
    expect(messages(result)).toMatch(/every\s+required channel would refuse/);
  });

  it('allows the kill-switch when nothing is required — that is a considered posture, not a contradiction', () => {
    expect(parse({ APP_ENV: 'prod', NOTIFY_REQUIRED_CHANNELS: 'none', NOTIFY_OUT_OF_APP_ENABLED: 'false' }).success).toBe(true);
  });
});
