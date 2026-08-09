import { z } from 'zod';
import { authEnvSchema, edgeEnvSchema, internalServiceEnvSchema, loadEnv, serviceEnvSchema } from '@intafaced/config';

// Self-mounts /trpc — must authenticate the edge principal (see packages/contracts/src/edge.ts).
// INTERNAL_SERVICE_SECRET is required because rank.awardXp is a serviceProcedure
// (user sessions carry identity:write and must never mint rank).
const boolish = z
  .union([z.boolean(), z.string()])
  .default(true)
  .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(v.toLowerCase())));

const schema = serviceEnvSchema
  .merge(authEnvSchema)
  .merge(edgeEnvSchema)
  .merge(internalServiceEnvSchema)
  .merge(
    z.object({
      SERVICE_NAME: z.string().default('svc-identity'),
      HTTP_PORT: z.coerce.number().int().default(4002),
      /** Registration open? §11 gates this behind the drop sequence. */
      REGISTRATION_OPEN: boolish,
      /**
       * WebAuthn relying party. Defaults suit local dev; production must set
       * the real registrable domain and HTTPS origin.
       */
      WEBAUTHN_RP_ID: z.string().min(1).default('localhost'),
      WEBAUTHN_RP_NAME: z.string().min(1).default('INTAFACED'),
      /** Comma-separated allowed origins for clientDataJSON.origin. */
      WEBAUTHN_ORIGIN: z.string().min(1).default('http://localhost:3000'),
      /** Kill-switch for the WebAuthn procedures without a redeploy of TOTP. */
      WEBAUTHN_ENABLED: boolish,
      /**
       * Owner-published affiliate commission accrual tiers (DIRECTION §8).
       * Blank / unset → unpublished; accrue refuses unless the request supplies
       * tiers. JSON shape: { "published": true, "tiers": [{ "hop": 0, "rate": "0.10" }] }.
       * Malformed → fail boot (parseAccrualTierLawJson throws). Never invent rates.
       */
      IDENTITY_AFFILIATE_ACCRUAL_TIERS_JSON: z.string().optional().default(''),
      /**
       * 32-byte AES-256 key (base64 or 64-char hex) for §10 KYC document store.
       * Blank = store refuses put/get (no improvised key). Vendor integration Class X.
       */
      IDENTITY_KYC_DOC_KEY: z.string().optional().default(''),
    }),
  );

export const env = loadEnv(schema);
export type Env = typeof env;
