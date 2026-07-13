-- AlterTable
ALTER TABLE "attendance" ADD COLUMN "checkout_office_distance_m" DOUBLE PRECISION,
ADD COLUMN "checkout_is_in_office" BOOLEAN NOT NULL DEFAULT false;
