-- A discretionary discount is now granted on a named person's authority and
-- bounded by that person's cap, replacing the untraceable manual amount that
-- reception used to type in. MANUAL_FIXED / MANUAL_PERCENT stay in the enum:
-- invoices raised before this change still carry them.

-- AlterEnum
ALTER TYPE "DiscountSource" ADD VALUE 'CARE_OF';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "discountCapPct" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "careOfUserId" TEXT;

-- CreateIndex
CREATE INDEX "Invoice_careOfUserId_idx" ON "Invoice"("careOfUserId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_careOfUserId_fkey" FOREIGN KEY ("careOfUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
