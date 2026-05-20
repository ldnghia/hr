-- Add device_validation_mode to employee
ALTER TABLE "employee" ADD COLUMN IF NOT EXISTS "device_validation_mode" TEXT NOT NULL DEFAULT 'STRICT';

-- Add is_unknown_device to attendance
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "is_unknown_device" BOOLEAN NOT NULL DEFAULT false;

-- Create registered_device table
CREATE TABLE IF NOT EXISTS "registered_device" (
    "id" SERIAL PRIMARY KEY,
    "employee_id" INTEGER NOT NULL,
    "device_fingerprint" TEXT NOT NULL,
    "device_name" TEXT,
    "user_agent" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registered_by_id" INTEGER,
    "last_used_at" TIMESTAMP(3),
    CONSTRAINT "registered_device_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "registered_device_registered_by_id_fkey" FOREIGN KEY ("registered_by_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Unique constraint: one fingerprint per employee
CREATE UNIQUE INDEX IF NOT EXISTS "registered_device_employee_id_device_fingerprint_key" ON "registered_device"("employee_id", "device_fingerprint");

-- Index for hot check-in lookups
CREATE INDEX IF NOT EXISTS "registered_device_employee_id_is_active_idx" ON "registered_device"("employee_id", "is_active");
