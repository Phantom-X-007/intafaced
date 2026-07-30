-- SUB-ACCOUNT REVOKE (soft-disable).
--
-- create + list shipped without a way to retire a bot/strategy book. Hard
-- DELETE is wrong: the ledger's `subaccount` owner type keys on this id, so
-- destroying the row would orphan ledger accounts and any trade.orders that
-- still name it. Soft-disable (same shape as api_keys.revoked and bank
-- spaces.archived_at) is the only safe retirement.
--
-- Deliberately does NOT move balances. Identity holds no balances and posts
-- nothing to the ledger. Value under owner_type=subaccount / owner_id=this id
-- stays the user's; sweeping on revoke would make a label change move money.

ALTER TABLE "identity"."sub_accounts"
  ADD COLUMN IF NOT EXISTS "revoked" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "sub_accounts_parent_revoked_idx"
  ON "identity"."sub_accounts" ("parent_user_id", "revoked");
