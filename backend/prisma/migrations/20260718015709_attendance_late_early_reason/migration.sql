-- Add dedicated late/early reason columns (kept separate from existing note/checkinNote/checkoutNote/locationNote)
ALTER TABLE "attendance"
  ADD COLUMN IF NOT EXISTS "late_reason"  TEXT,
  ADD COLUMN IF NOT EXISTS "early_reason" TEXT;

ALTER TABLE "attendance_log"
  ADD COLUMN IF NOT EXISTS "reason" TEXT;
