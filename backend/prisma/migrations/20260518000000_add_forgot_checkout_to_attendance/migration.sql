-- AlterTable
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "forgot_checkout" BOOLEAN NOT NULL DEFAULT false;
