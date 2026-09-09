-- Durable action-bound approval (Astra stage A / PX-S02).
-- Two names in one request are not two people. Identity issues the row;
-- the target service consumes it. Reversal: 0024_action_approvals.down.sql

CREATE TABLE IF NOT EXISTS "identity"."action_approvals" (
  "approval_id"       text PRIMARY KEY,
  "action_type"       text NOT NULL,
  "target_service"    text NOT NULL,
  "target_id"         text NOT NULL,
  "expected_version"  text NOT NULL,
  "payload_hash"      text NOT NULL,
  "requester_id"      text NOT NULL,
  "approver_id"       text,
  "policy_version"    text NOT NULL,
  "operation_id"      text NOT NULL,
  "status"            text NOT NULL,
  "created_at"        timestamptz NOT NULL,
  "expires_at"        timestamptz NOT NULL,
  "approved_at"       timestamptz,
  "consumed_at"       timestamptz,
  CONSTRAINT "action_approvals_status_ck"
    CHECK ("status" IN ('PENDING', 'APPROVED', 'CONSUMED', 'REJECTED', 'EXPIRED', 'REVOKED')),
  CONSTRAINT "action_approvals_approver_ck"
    CHECK (
      ("status" = 'PENDING' AND "approver_id" IS NULL)
      OR ("status" <> 'PENDING' AND "approver_id" IS NOT NULL)
      OR ("status" IN ('EXPIRED', 'REVOKED', 'REJECTED'))
    ),
  CONSTRAINT "action_approvals_distinct_ck"
    CHECK ("approver_id" IS NULL OR "approver_id" <> "requester_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "action_approvals_operation_idx"
  ON "identity"."action_approvals" ("operation_id");
CREATE INDEX IF NOT EXISTS "action_approvals_status_exp_idx"
  ON "identity"."action_approvals" ("status", "expires_at");
