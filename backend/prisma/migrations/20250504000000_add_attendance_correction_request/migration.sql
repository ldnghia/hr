-- AlterTable
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "is_corrected" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "attendance_correction_request" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "attendance_id" INTEGER NOT NULL,
    "requested_checkin_time" TIMESTAMP(3),
    "requested_checkout_time" TIMESTAMP(3),
    "requested_checkin_note" TEXT,
    "requested_checkout_note" TEXT,
    "requested_shift_id" INTEGER,
    "original_checkin_time" TIMESTAMP(3),
    "original_checkout_time" TIMESTAMP(3),
    "original_checkin_note" TEXT,
    "original_checkout_note" TEXT,
    "original_shift_id" INTEGER,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_correction_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_correction_request_employee_id_created_at_idx" ON "attendance_correction_request"("employee_id", "created_at");

-- CreateIndex
CREATE INDEX "attendance_correction_request_attendance_id_status_idx" ON "attendance_correction_request"("attendance_id", "status");

-- AddForeignKey
ALTER TABLE "attendance_correction_request" ADD CONSTRAINT "attendance_correction_request_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_correction_request" ADD CONSTRAINT "attendance_correction_request_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_correction_request" ADD CONSTRAINT "attendance_correction_request_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_correction_request" ADD CONSTRAINT "attendance_correction_request_requested_shift_id_fkey" FOREIGN KEY ("requested_shift_id") REFERENCES "shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
