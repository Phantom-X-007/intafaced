-- intafaced:destructive — reversal of 0001_notify_channels.sql
--
-- Drops every confirmed address and every delivery record. Exists so the
-- migration is provably reversible in CI against a scratch schema (§14), not for
-- production use: the delivery table is the evidence that a margin call was or
-- was not delivered, and dropping it destroys the answer to a dispute.
--
-- The inbox itself (0000) is untouched. The "notify" schema is left in place —
-- the bootstrap owns it, not this migration (§2).

DROP TABLE IF EXISTS "notify"."deliveries";
DROP TABLE IF EXISTS "notify"."channel_targets";
