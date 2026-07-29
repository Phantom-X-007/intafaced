-- Reversal of 0002_bank_cards.sql.
--
-- Dropped in dependency order: authorisations reference cards, cards reference
-- programmes. The enums go last, because a type cannot be dropped while a
-- column still uses it.
--
-- This reversal DESTROYS card and authorisation history. That is correct for a
-- migration reversal and worth stating plainly: rolling this back on an
-- environment where cards have spent means the ledger still holds the postings
-- (it is append-only and none of this touches it) while the record of which
-- card made them is gone. Reversing in prod is a decision, not a rollback step.

DROP TABLE IF EXISTS "bank"."card_authorizations";
DROP TABLE IF EXISTS "bank"."cards";
DROP TABLE IF EXISTS "bank"."card_programmes";

DROP TYPE IF EXISTS "bank"."card_authorization_status";
DROP TYPE IF EXISTS "bank"."card_channel";
DROP TYPE IF EXISTS "bank"."card_form";
DROP TYPE IF EXISTS "bank"."card_status";
DROP TYPE IF EXISTS "bank"."card_programme_status";
DROP TYPE IF EXISTS "bank"."card_funding_source";
