-- Enum labels cannot be dropped cheaply in PG. 0015 down restores the old
-- check and deletes card_roundup rows; this file is a no-op on the type.
SELECT 1;
