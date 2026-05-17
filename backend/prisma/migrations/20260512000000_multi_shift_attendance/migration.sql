-- ============================================================
-- Migration: multi_shift_attendance
-- Purpose: Allow employees to have multiple shift sessions per day.
--   Part A: Change Attendance unique constraint from (employee_id, date)
--           to (employee_id, date, shift_id) — one row per shift session.
--   Part B: Add year + month to EmployeeShiftAssignment for monthly scheduling.
-- ============================================================

-- ============================================================
-- PART A: Attendance — backfill shift_id, swap unique constraint
-- ============================================================

-- Step 1: Backfill shift_id from employee.shift_id where NULL
UPDATE attendance a
SET shift_id = e.shift_id
FROM employee e
WHERE a.employee_id = e.id
  AND a.shift_id IS NULL
  AND e.shift_id IS NOT NULL;

-- Step 2: Backfill any remaining NULL shift_id with the default shift (id=1)
UPDATE attendance
SET shift_id = 1
WHERE shift_id IS NULL;

-- Step 3: Drop the old unique index created by Prisma (@@unique([employeeId, date]))
-- Prisma 5 creates a UNIQUE INDEX named attendance_employee_id_date_key
DROP INDEX IF EXISTS "attendance_employee_id_date_key";

-- Step 4: Add new unique constraint (employee_id, date, shift_id)
-- Use IF NOT EXISTS via index approach for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_employee_id_date_shift_id_key"
  ON attendance (employee_id, date, shift_id);

-- Step 5: Add performance index on (employee_id, date) for daily lookups
CREATE INDEX IF NOT EXISTS "attendance_employee_id_date_idx"
  ON attendance (employee_id, date);

-- ============================================================
-- PART B: EmployeeShiftAssignment — add year + month columns
-- ============================================================

-- Step 6: Add year and month as nullable first (to allow backfill on existing rows)
ALTER TABLE employee_shift_assignment
  ADD COLUMN IF NOT EXISTS year INTEGER;

ALTER TABLE employee_shift_assignment
  ADD COLUMN IF NOT EXISTS month INTEGER;

-- Step 7: Backfill year and month from effective_date
UPDATE employee_shift_assignment
SET year  = EXTRACT(YEAR  FROM effective_date)::INTEGER,
    month = EXTRACT(MONTH FROM effective_date)::INTEGER
WHERE year IS NULL OR month IS NULL;

-- Step 8: Remove duplicate (employee_id, shift_id, year, month) rows — keep highest id
-- (Duplicates can exist when assignment was created twice for same employee+shift+month)
DELETE FROM employee_shift_assignment
WHERE id NOT IN (
  SELECT MAX(id)
  FROM employee_shift_assignment
  GROUP BY employee_id, shift_id, year, month
);

-- Step 9: Enforce NOT NULL after backfill and dedup
ALTER TABLE employee_shift_assignment
  ALTER COLUMN year  SET NOT NULL;

ALTER TABLE employee_shift_assignment
  ALTER COLUMN month SET NOT NULL;

-- Step 10: Unique constraint — one shift per employee per calendar month
CREATE UNIQUE INDEX IF NOT EXISTS "employee_shift_assignment_employee_id_shift_id_year_month_key"
  ON employee_shift_assignment (employee_id, shift_id, year, month);

-- Step 11: Index for monthly shift lookup (used by resolveTargetShift)
CREATE INDEX IF NOT EXISTS "employee_shift_assignment_employee_id_year_month_idx"
  ON employee_shift_assignment (employee_id, year, month);
