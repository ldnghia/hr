-- AlterTable
ALTER TABLE "employee" ADD COLUMN IF NOT EXISTS "google_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "employee_google_id_key" ON "employee"("google_id");
