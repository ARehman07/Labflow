-- Booking parity with xMed: CNIC, email and photo on patients; where the sample
-- was taken and the promised report time on visits; per-test booking remarks and
-- delay reasons; payment accounts; and files attached to a booking.

-- CreateEnum
CREATE TYPE "SampleSource" AS ENUM ('INSIDE_LAB', 'OUTSIDE_LAB', 'HOME', 'EXISTING');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "cnic" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "photoDataUrl" TEXT;

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "reportDueAt" TIMESTAMP(3),
ADD COLUMN     "sampleSource" "SampleSource" NOT NULL DEFAULT 'INSIDE_LAB';

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "bookingRemarks" TEXT,
ADD COLUMN     "delayReason" TEXT,
ADD COLUMN     "delayedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "accountId" TEXT;

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN     "accountId" TEXT;

-- CreateTable
CREATE TABLE "PaymentAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentAccount_tenantId_idx" ON "PaymentAccount"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAccount_tenantId_name_key" ON "PaymentAccount"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Attachment_visitId_idx" ON "Attachment"("visitId");

-- CreateIndex
CREATE INDEX "Attachment_tenantId_idx" ON "Attachment"("tenantId");

-- CreateIndex
CREATE INDEX "Patient_cnic_idx" ON "Patient"("cnic");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAccount" ADD CONSTRAINT "PaymentAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

