-- AlterTable
ALTER TABLE "employee" ADD COLUMN IF NOT EXISTS "attendance_exempt" BOOLEAN NOT NULL DEFAULT false;
