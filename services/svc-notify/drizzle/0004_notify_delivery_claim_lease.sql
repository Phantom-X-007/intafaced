-- svc-notify · delivery claim lease (two-replica double-send guard)
-- Reversal: 0004_notify_delivery_claim_lease.down.sql
--
-- THE DEFECT
--
-- claim() used to re-own any row still in status 'pending'. Two replicas
-- racing the same redelivered bus event could both claim a row that was still
-- mid-send: the first had not settled yet, so the second saw 'pending' and
-- attempted the gateway again. Attempts counters rose; the user got two emails.
--
-- THE FIX
--
-- lease_until is set on every successful claim. A second claim may only re-own
-- the row when:
--   • status = 'failed' (settled retryable failure — safe to re-attempt), or
--   • status = 'pending' AND lease_until has expired (owner crashed mid-send).
--
-- Active lease + pending ⇒ second claim returns in_flight (no second send).
-- NULL lease_until is treated as expired so pre-migration rows stay recoverable.

ALTER TABLE "notify"."deliveries"
  ADD COLUMN IF NOT EXISTS "lease_until" timestamptz;

CREATE INDEX IF NOT EXISTS "deliveries_lease_idx"
  ON "notify"."deliveries" ("lease_until")
  WHERE "status" = 'pending' AND "lease_until" IS NOT NULL;
