-- L3-2: pending stake claim before ledger post (non-yielding until active).
DO $$ BEGIN
  ALTER TYPE "token"."stake_status" ADD VALUE 'pending' BEFORE 'active';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
