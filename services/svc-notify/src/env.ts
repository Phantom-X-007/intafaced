import { z } from 'zod';
import { edgeEnvSchema, loadEnv, serviceEnvSchema } from '@intafaced/config';

/**
 * svc-notify environment.
 *
 * Self-mounts /trpc, so it must authenticate the edge principal. No ledger
 * client, no INTERNAL_SERVICE_SECRET — this service never moves value and never
 * calls another service with a service credential.
 *
 * THE CHANNEL CREDENTIALS (§0.4)
 *
 * Email, push and SMS each reach the world through a gateway URL the owner
 * configures. Whoever answers that URL is the owner's choice and is named
 * nowhere in this repository: §0.7 keeps partner names out of shipped code, and
 * keeping the name out of the code is also what makes changing provider an env
 * change rather than a release.
 *
 * A channel with no URL is not "off". It is UNCONFIGURED, and it refuses every
 * message by name so the refusal is on the record — see `channels/gateway.ts`.
 */

const bool = (defaultOn: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .default(defaultOn)
    .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(String(v).toLowerCase())));

const schema = serviceEnvSchema
  .merge(edgeEnvSchema)
  .merge(
    z.object({
      SERVICE_NAME: z.string().default('svc-notify'),
      HTTP_PORT: z.coerce.number().int().default(4015),

      /**
       * Fan-out kill-switch. When false, event consumers still ack but do not
       * insert inbox rows — and therefore send nothing anywhere. Pairs with the
       * `notify.fanout` feature flag. The operator stop for notification spam.
       */
      NOTIFY_FANOUT_ENABLED: bool(true),

      /**
       * The narrower stop: keep filling the inbox, send nothing out of the
       * platform. This is the switch for an incident — silencing customers'
       * phones without also blinding them.
       */
      NOTIFY_OUT_OF_APP_ENABLED: bool(true),

      /** Email gateway. URL and token are all-or-nothing; see the refine below. */
      NOTIFY_EMAIL_GATEWAY_URL: z.string().url().optional(),
      NOTIFY_EMAIL_GATEWAY_TOKEN: z.string().min(16).optional(),

      /** Push gateway. */
      NOTIFY_PUSH_GATEWAY_URL: z.string().url().optional(),
      NOTIFY_PUSH_GATEWAY_TOKEN: z.string().min(16).optional(),

      /** SMS gateway. */
      NOTIFY_SMS_GATEWAY_URL: z.string().url().optional(),
      NOTIFY_SMS_GATEWAY_TOKEN: z.string().min(16).optional(),

      /** Budget for one gateway call. A slow gateway must not stall the consumer. */
      NOTIFY_GATEWAY_TIMEOUT_MS: z.coerce.number().int().min(250).max(30_000).default(5_000),

      /**
       * Attempts per channel before a delivery row is abandoned. Kept at or below
       * the bus `maxDeliver` (5) so the row retires before JetStream parks the
       * message — otherwise the record would read "still retrying" about a
       * message nothing is retrying.
       */
      NOTIFY_MAX_DELIVERY_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),

      /** How long an address-confirmation code stays valid. */
      NOTIFY_VERIFY_TTL_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
    }),
  )
  .superRefine((parsed, ctx) => {
    // A gateway URL with no credential is an open relay for anything that can
    // reach it. Refusing to boot is the correct response: the alternative is a
    // service that looks configured and posts unauthenticated notifications at
    // somebody's endpoint.
    const pairs = [
      ['email', parsed.NOTIFY_EMAIL_GATEWAY_URL, parsed.NOTIFY_EMAIL_GATEWAY_TOKEN, 'NOTIFY_EMAIL_GATEWAY_TOKEN'],
      ['push', parsed.NOTIFY_PUSH_GATEWAY_URL, parsed.NOTIFY_PUSH_GATEWAY_TOKEN, 'NOTIFY_PUSH_GATEWAY_TOKEN'],
      ['sms', parsed.NOTIFY_SMS_GATEWAY_URL, parsed.NOTIFY_SMS_GATEWAY_TOKEN, 'NOTIFY_SMS_GATEWAY_TOKEN'],
    ] as const;

    for (const [channel, url, token, tokenVar] of pairs) {
      if (url && !token) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [tokenVar],
          message: `${channel} gateway URL is set without ${tokenVar}. An unauthenticated notification gateway is an open relay — set the token, or unset the URL and let the channel refuse honestly.`,
        });
      }
    }
  });

export const envSchema = schema;
export const env = loadEnv(schema);
export type Env = typeof env;
