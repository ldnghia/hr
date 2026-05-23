-- Reset device_validation_mode to DISABLED for all existing employees
-- and change the column default to DISABLED.
-- Reason: initial migration set default to STRICT, but feature should be opt-in.
ALTER TABLE "employee" ALTER COLUMN "device_validation_mode" SET DEFAULT 'DISABLED';
UPDATE "employee" SET "device_validation_mode" = 'DISABLED';
