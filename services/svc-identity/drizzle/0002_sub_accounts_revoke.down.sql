-- intafaced:destructive — reversal of 0002_sub_accounts_revoke.sql
--
-- Drops the soft-disable flag. Rows that were revoked become active again in
-- the catalogue; ledger balances were never moved by the forward migration, so
-- this does not invent or destroy value — only the label of "retired".

DROP INDEX IF EXISTS "identity"."sub_accounts_parent_revoked_idx";

ALTER TABLE "identity"."sub_accounts" DROP COLUMN IF EXISTS "revoked";
