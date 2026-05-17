-- ============================================================
-- Migration: add_shift_schedule_and_day_off_tables
-- Purpose: Create employee_shift_schedule and employee_day_off tables
--          that were missing from migration 20260512000000_multi_shift_attendance.
-- ============================================================

-- ─── employee_shift_schedule ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "employee_shift_schedule" (
  "id"           SERIAL PRIMARY KEY,
  "employee_id"  INTEGER NOT NULL,
  "shift_id"     INTEGER NOT NULL,
  "date"         DATE    NOT NULL,
  "note"         TEXT,
  "created_by_id" INTEGER,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "employee_shift_schedule_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employee"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT "employee_shift_schedule_shift_id_fkey"
    FOREIGN KEY ("shift_id") REFERENCES "shift"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT "employee_shift_schedule_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "employee"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "employee_shift_schedule_employee_id_date_shift_id_key"
  ON "employee_shift_schedule" ("employee_id", "date", "shift_id");

CREATE INDEX IF NOT EXISTS "employee_shift_schedule_employee_id_date_idx"
  ON "employee_shift_schedule" ("employee_id", "date");

-- ─── employee_day_off ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "employee_day_off" (
  "id"           SERIAL PRIMARY KEY,
  "employee_id"  INTEGER NOT NULL,
  "date"         DATE    NOT NULL,
  "off_type"     TEXT    NOT NULL,
  "note"         TEXT,
  "created_by_id" INTEGER,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "employee_day_off_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employee"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT "employee_day_off_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "employee"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "employee_day_off_employee_id_date_key"
  ON "employee_day_off" ("employee_id", "date");

CREATE INDEX IF NOT EXISTS "employee_day_off_employee_id_date_idx"
  ON "employee_day_off" ("employee_id", "date");
