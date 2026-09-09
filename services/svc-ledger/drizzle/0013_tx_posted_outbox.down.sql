-- intafaced:destructive — reversal of 0013_tx_posted_outbox.sql
--
-- Dropping this table discards unpublished publish intent. A movement already
-- in ledger_tx would then have no durable record that `ledgerTxPosted` still
-- needs to leave the process. Refuse rather than silently drop that queue.

DO $$
DECLARE
  n bigint;
BEGIN
  SELECT count(*) INTO n
    FROM "ledger"."ledger_tx_outbox"
   WHERE "published_at" IS NULL;

  IF n > 0 THEN
    RAISE EXCEPTION
      'Cannot reverse 0013: % unpublished ledgerTxPosted outbox row(s). Publish or mark them sent first — dropping the table would forget that the book moved and the bus did not.',
      n;
  END IF;
END $$;

DROP INDEX IF EXISTS "ledger"."ledger_tx_outbox_unpublished_idx";
DROP INDEX IF EXISTS "ledger"."ledger_tx_outbox_tx_idx";
DROP TABLE IF EXISTS "ledger"."ledger_tx_outbox";
