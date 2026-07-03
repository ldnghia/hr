ALTER TABLE "leave_request" ADD COLUMN IF NOT EXISTS "half_day_session" TEXT;
ALTER TABLE "leave_request" ADD COLUMN IF NOT EXISTS "shift_id" INTEGER;
