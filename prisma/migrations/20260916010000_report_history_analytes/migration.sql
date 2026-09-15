-- Report history follows the analyte (TCHOL, HDL, HBA1C...) across tests.
ALTER TABLE "TestParameter" ADD COLUMN     "analyteCode" TEXT;

-- How far back report history looks, in months (0 = no limit).
ALTER TABLE "Tenant" ADD COLUMN     "reportHistoryMonths" INTEGER NOT NULL DEFAULT 24;

-- CreateIndex
CREATE INDEX "TestParameter_tenantId_analyteCode_idx" ON "TestParameter"("tenantId", "analyteCode");
