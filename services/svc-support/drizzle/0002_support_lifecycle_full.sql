-- Migration 0002 — full ticket lifecycle in the database (matches lifecycle.ts).
--
-- 0001 only re-asserted that `closed` is terminal. A psql session could still
-- `UPDATE … SET status = 'pending' WHERE status = 'resolved'`, which TypeScript
-- refuses and which leaves no trail row. The legal edges live in one place in
-- application code; the database now refuses the same illegal edges so a
-- bypass of the service cannot invent a history the desk would not write.

CREATE OR REPLACE FUNCTION "support"."tickets_status_transition"() RETURNS trigger AS $$
BEGIN
  -- Assignee / updated_at bumps with no status change are fine.
  IF OLD."status" IS NOT DISTINCT FROM NEW."status" THEN
    RETURN NEW;
  END IF;

  -- Edges mirror services/svc-support/src/lifecycle.ts TICKET_TRANSITIONS.
  IF OLD."status" = 'open' AND NEW."status" IN ('pending', 'resolved', 'closed') THEN
    RETURN NEW;
  END IF;
  IF OLD."status" = 'pending' AND NEW."status" IN ('open', 'resolved', 'closed') THEN
    RETURN NEW;
  END IF;
  IF OLD."status" = 'resolved' AND NEW."status" IN ('open', 'closed') THEN
    RETURN NEW;
  END IF;
  -- closed has no outgoing edges (terminal).
  IF OLD."status" = 'closed' THEN
    RAISE EXCEPTION 'ticket % is closed: closed is terminal (attempted %)', OLD."id", NEW."status"
      USING ERRCODE = 'check_violation';
  END IF;

  RAISE EXCEPTION 'ticket % illegal status transition % → %', OLD."id", OLD."status", NEW."status"
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "tickets_status_transition_trg" ON "support"."tickets";
CREATE TRIGGER "tickets_status_transition_trg"
  BEFORE UPDATE ON "support"."tickets"
  FOR EACH ROW EXECUTE FUNCTION "support"."tickets_status_transition"();

-- 0001's closed-only trigger is superseded by the full table above.
DROP TRIGGER IF EXISTS "tickets_closed_is_terminal_trg" ON "support"."tickets";
DROP FUNCTION IF EXISTS "support"."tickets_closed_is_terminal"();
