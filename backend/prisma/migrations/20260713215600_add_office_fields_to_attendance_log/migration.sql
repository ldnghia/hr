-- AlterTable
ALTER TABLE "attendance_log" ADD COLUMN "is_in_office" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "office_distance_m" DOUBLE PRECISION;
