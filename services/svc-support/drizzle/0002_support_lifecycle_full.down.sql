-- Reverse: only closed terminal (migration 0001 shape), drop full transition fn.

DROP TRIGGER IF EXISTS "tickets_status_transition_trg" ON "support"."tickets";
DROP FUNCTION IF EXISTS "support"."tickets_status_transition"();

CREATE OR REPLACE FUNCTION "support"."tickets_closed_is_terminal"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'closed' AND NEW."status" <> 'closed' THEN
    RAISE EXCEPTION 'ticket % is closed: closed is terminal (attempted %)', OLD."id", NEW."status"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "tickets_closed_is_terminal_trg" ON "support"."tickets";
CREATE TRIGGER "tickets_closed_is_terminal_trg"
  BEFORE UPDATE ON "support"."tickets"
  FOR EACH ROW EXECUTE FUNCTION "support"."tickets_closed_is_terminal"();
