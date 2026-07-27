-- svc-protocol · initial schema (§17.4 self-custody smart accounts)
-- Reversal: 0000_protocol_init.down.sql
--
-- The "protocol" schema itself is created by the database bootstrap
-- (tooling/infra/postgres-init/01-service-schemas.sql), which grants it to the
-- svc_protocol role. Migrations run as that role and hold no database-level
-- CREATE, so a migration cannot reach outside its own schema (§2).
--
-- EVERYTHING HERE IS A READ MODEL. The chain is the record. There is no balance
-- column, no running total, and no key material in this schema — by design, and
-- Doctrine §16.9 is the reason: on this plane the service holds nothing.

CREATE TABLE IF NOT EXISTS "protocol"."smart_accounts" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- svc-identity's user id. Not a foreign key: services never reference each
  -- other's tables (§2). Referential integrity across services is the event
  -- bus's job, not Postgres's.
  "user_id"     uuid NOT NULL,
  "chain_id"    integer NOT NULL,
  -- Checksummed EVM address, known before deployment via CREATE2.
  "address"     text NOT NULL,
  -- The user's key: an EOA, or a P-256 verifier contract for a passkey owner.
  "owner"       text NOT NULL,
  -- 32-byte hex. One owner may hold several accounts (named spaces, §23).
  "user_salt"   text NOT NULL,
  "deployed"    boolean NOT NULL DEFAULT false,
  "deployed_at" timestamptz,
  -- Set when the owner key signed the binding message. Null = unproven claim.
  "verified_at" timestamptz,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "smart_accounts_address_ck" CHECK ("address" ~ '^0x[0-9a-fA-F]{40}$'),
  CONSTRAINT "smart_accounts_owner_ck"   CHECK ("owner" ~ '^0x[0-9a-fA-F]{40}$'),
  CONSTRAINT "smart_accounts_salt_ck"    CHECK ("user_salt" ~ '^0x[0-9a-fA-F]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS "smart_accounts_chain_address_idx"
  ON "protocol"."smart_accounts" ("chain_id", "address");

-- One account per (chain, owner, salt) — the same triple CREATE2 keys on, so
-- the database cannot hold two rows for one on-chain address.
CREATE UNIQUE INDEX IF NOT EXISTS "smart_accounts_owner_salt_idx"
  ON "protocol"."smart_accounts" ("chain_id", "owner", "user_salt");

CREATE INDEX IF NOT EXISTS "smart_accounts_user_idx"
  ON "protocol"."smart_accounts" ("user_id", "chain_id");

CREATE TABLE IF NOT EXISTS "protocol"."session_keys" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id"      uuid NOT NULL REFERENCES "protocol"."smart_accounts" ("id") ON DELETE CASCADE,
  -- The delegated signer. Held by an agent or a device — never by this service.
  "session_key"     text NOT NULL,
  -- keccak256 of the full scope: the commitment the account stores on chain.
  "spec_hash"       text NOT NULL,
  "valid_after"     timestamptz NOT NULL,
  "valid_until"     timestamptz NOT NULL,
  -- A CAP, not a balance: the most this session may EVER move, in wei.
  -- The amount actually spent lives on chain, where it is enforced, and is
  -- deliberately not cached here — a cached total can disagree with the one
  -- that matters.
  "spend_limit_wei" numeric(78,0) NOT NULL,
  "targets"         text[] NOT NULL DEFAULT '{}',
  "selectors"       text[] NOT NULL DEFAULT '{}',
  "revoked"         boolean NOT NULL DEFAULT false,
  "revoked_at"      timestamptz,
  "granted_tx_hash" text,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "session_keys_key_ck"      CHECK ("session_key" ~ '^0x[0-9a-fA-F]{40}$'),
  CONSTRAINT "session_keys_hash_ck"     CHECK ("spec_hash" ~ '^0x[0-9a-fA-F]{64}$'),
  -- A session with no expiry is not a session. The contract refuses one; so
  -- does the read model, so a bug here cannot render a permanent grant.
  CONSTRAINT "session_keys_expiry_ck"   CHECK ("valid_until" > "valid_after"),
  CONSTRAINT "session_keys_targets_ck"  CHECK (cardinality("targets") > 0),
  CONSTRAINT "session_keys_selectors_ck" CHECK (cardinality("selectors") > 0),
  CONSTRAINT "session_keys_limit_ck"    CHECK ("spend_limit_wei" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "session_keys_account_key_hash_idx"
  ON "protocol"."session_keys" ("account_id", "session_key", "spec_hash");

CREATE INDEX IF NOT EXISTS "session_keys_live_idx"
  ON "protocol"."session_keys" ("account_id", "revoked", "valid_until");
