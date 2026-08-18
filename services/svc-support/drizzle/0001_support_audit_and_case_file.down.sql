-- Reverse 0001_support_audit_and_case_file.sql
--
-- Reverting this drops the desk's history. The tables go with it, which is the
-- honest reversal: leaving an append-only trail behind with nothing writing to
-- it would look like an audit trail while recording nothing new.
DROP TRIGGER IF EXISTS "case_files_immutable_trg" ON "support"."case_files";
DROP FUNCTION IF EXISTS "support"."case_files_immutable"();
DROP TABLE IF EXISTS "support"."case_files";

DROP TRIGGER IF EXISTS "tickets_closed_is_terminal_trg" ON "support"."tickets";
DROP FUNCTION IF EXISTS "support"."tickets_closed_is_terminal"();

DROP TRIGGER IF EXISTS "ticket_events_append_only_trg" ON "support"."ticket_events";
DROP FUNCTION IF EXISTS "support"."ticket_events_append_only"();
DROP TABLE IF EXISTS "support"."ticket_events";
