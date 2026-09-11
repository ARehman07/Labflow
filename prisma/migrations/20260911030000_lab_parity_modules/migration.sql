-- Lab parity with xMed, remaining modules: per-line prices and test packages,
-- rate groups and collection points, B2B partner accounts and outsourcing,
-- cut-off parameters and culture & sensitivity, QC materials and runs, lab
-- stock, and analyzer interfacing. Portal logins for partners and doctors.

-- CreateEnum
CREATE TYPE "TestReportFormat" AS ENUM ('STANDARD', 'CULTURE');

-- CreateEnum
CREATE TYPE "PartnerAccountType" AS ENUM ('PREPAID', 'CASH', 'POSTPAID');

-- CreateEnum
CREATE TYPE "PartnerLedgerType" AS ENUM ('CHARGE', 'PAYMENT', 'TOPUP', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIVE', 'ISSUE', 'CONSUME', 'ADJUST', 'RETURN');

-- AlterEnum
ALTER TYPE "ParamValueType" ADD VALUE 'CUTOFF';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "doctorId" TEXT,
ADD COLUMN     "partnerLabId" TEXT;

-- AlterTable
ALTER TABLE "PartnerLab" ADD COLUMN     "accountType" "PartnerAccountType" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "rateGroupId" TEXT;

-- AlterTable
ALTER TABLE "Test" ADD COLUMN     "reportFormat" "TestReportFormat" NOT NULL DEFAULT 'STANDARD';

-- AlterTable
ALTER TABLE "TestParameter" ADD COLUMN     "cutoff" DECIMAL(12,4),
ADD COLUMN     "negativeLabel" TEXT,
ADD COLUMN     "positiveLabel" TEXT;

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "collectionPointId" TEXT,
ADD COLUMN     "rateGroupId" TEXT;

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "outsourceRef" TEXT,
ADD COLUMN     "outsourcedAt" TIMESTAMP(3),
ADD COLUMN     "outsourcedToId" TEXT,
ADD COLUMN     "packageId" TEXT,
ADD COLUMN     "price" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'BOOKING',
ADD COLUMN     "orderLineId" TEXT;

-- CreateTable
CREATE TABLE "TestPackage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestPackageItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,

    CONSTRAINT "TestPackageItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultDiscountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateGroupPrice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rateGroupId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "RateGroupPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionPoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "rateGroupId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerLedgerEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partnerLabId" TEXT NOT NULL,
    "visitId" TEXT,
    "type" "PartnerLedgerType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CultureResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "growth" BOOLEAN NOT NULL DEFAULT false,
    "organism" TEXT,
    "colonyCount" TEXT,
    "incubation" TEXT,
    "remarks" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CultureResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CultureSensitivity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cultureResultId" TEXT NOT NULL,
    "antibiotic" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "mic" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CultureSensitivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Antibiotic" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Antibiotic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QcMaterial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "parameterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "lotNo" TEXT,
    "mean" DECIMAL(12,4) NOT NULL,
    "sd" DECIMAL(12,4) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QcMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QcRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enteredById" TEXT NOT NULL,
    "violations" TEXT,
    "rejected" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "QcRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reorderLevel" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "department" TEXT,
    "issuedBy" TEXT,
    "receivedBy" TEXT,
    "note" TEXT,
    "orderLineId" TEXT,
    "serialNo" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestConsumable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "TestConsumable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analyzer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analyzer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyzerMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "analyzerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "parameterId" TEXT NOT NULL,

    CONSTRAINT "AnalyzerMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyzerMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "analyzerId" TEXT NOT NULL,
    "barcode" TEXT,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyzerMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TestPackage_tenantId_idx" ON "TestPackage"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TestPackage_tenantId_name_key" ON "TestPackage"("tenantId", "name");

-- CreateIndex
CREATE INDEX "TestPackageItem_tenantId_idx" ON "TestPackageItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TestPackageItem_packageId_testId_key" ON "TestPackageItem"("packageId", "testId");

-- CreateIndex
CREATE INDEX "RateGroup_tenantId_idx" ON "RateGroup"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RateGroup_tenantId_name_key" ON "RateGroup"("tenantId", "name");

-- CreateIndex
CREATE INDEX "RateGroupPrice_tenantId_idx" ON "RateGroupPrice"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RateGroupPrice_rateGroupId_testId_key" ON "RateGroupPrice"("rateGroupId", "testId");

-- CreateIndex
CREATE INDEX "CollectionPoint_tenantId_idx" ON "CollectionPoint"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionPoint_tenantId_name_key" ON "CollectionPoint"("tenantId", "name");

-- CreateIndex
CREATE INDEX "PartnerLedgerEntry_partnerLabId_idx" ON "PartnerLedgerEntry"("partnerLabId");

-- CreateIndex
CREATE INDEX "PartnerLedgerEntry_tenantId_idx" ON "PartnerLedgerEntry"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CultureResult_orderLineId_key" ON "CultureResult"("orderLineId");

-- CreateIndex
CREATE INDEX "CultureResult_tenantId_idx" ON "CultureResult"("tenantId");

-- CreateIndex
CREATE INDEX "CultureSensitivity_tenantId_idx" ON "CultureSensitivity"("tenantId");

-- CreateIndex
CREATE INDEX "Antibiotic_tenantId_idx" ON "Antibiotic"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Antibiotic_tenantId_name_key" ON "Antibiotic"("tenantId", "name");

-- CreateIndex
CREATE INDEX "QcMaterial_tenantId_idx" ON "QcMaterial"("tenantId");

-- CreateIndex
CREATE INDEX "QcRun_materialId_idx" ON "QcRun"("materialId");

-- CreateIndex
CREATE INDEX "QcRun_tenantId_idx" ON "QcRun"("tenantId");

-- CreateIndex
CREATE INDEX "InventoryItem_tenantId_idx" ON "InventoryItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_tenantId_name_key" ON "InventoryItem"("tenantId", "name");

-- CreateIndex
CREATE INDEX "StockMovement_itemId_idx" ON "StockMovement"("itemId");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_idx" ON "StockMovement"("tenantId");

-- CreateIndex
CREATE INDEX "TestConsumable_tenantId_idx" ON "TestConsumable"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TestConsumable_testId_itemId_key" ON "TestConsumable"("testId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Analyzer_keyHash_key" ON "Analyzer"("keyHash");

-- CreateIndex
CREATE INDEX "Analyzer_tenantId_idx" ON "Analyzer"("tenantId");

-- CreateIndex
CREATE INDEX "AnalyzerMapping_tenantId_idx" ON "AnalyzerMapping"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyzerMapping_analyzerId_code_key" ON "AnalyzerMapping"("analyzerId", "code");

-- CreateIndex
CREATE INDEX "AnalyzerMessage_analyzerId_idx" ON "AnalyzerMessage"("analyzerId");

-- CreateIndex
CREATE INDEX "AnalyzerMessage_tenantId_idx" ON "AnalyzerMessage"("tenantId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_partnerLabId_fkey" FOREIGN KEY ("partnerLabId") REFERENCES "PartnerLab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerLab" ADD CONSTRAINT "PartnerLab_rateGroupId_fkey" FOREIGN KEY ("rateGroupId") REFERENCES "RateGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_rateGroupId_fkey" FOREIGN KEY ("rateGroupId") REFERENCES "RateGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_collectionPointId_fkey" FOREIGN KEY ("collectionPointId") REFERENCES "CollectionPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "TestPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_outsourcedToId_fkey" FOREIGN KEY ("outsourcedToId") REFERENCES "PartnerLab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestPackage" ADD CONSTRAINT "TestPackage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestPackageItem" ADD CONSTRAINT "TestPackageItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestPackageItem" ADD CONSTRAINT "TestPackageItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "TestPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestPackageItem" ADD CONSTRAINT "TestPackageItem_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateGroup" ADD CONSTRAINT "RateGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateGroupPrice" ADD CONSTRAINT "RateGroupPrice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateGroupPrice" ADD CONSTRAINT "RateGroupPrice_rateGroupId_fkey" FOREIGN KEY ("rateGroupId") REFERENCES "RateGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateGroupPrice" ADD CONSTRAINT "RateGroupPrice_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPoint" ADD CONSTRAINT "CollectionPoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPoint" ADD CONSTRAINT "CollectionPoint_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPoint" ADD CONSTRAINT "CollectionPoint_rateGroupId_fkey" FOREIGN KEY ("rateGroupId") REFERENCES "RateGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerLedgerEntry" ADD CONSTRAINT "PartnerLedgerEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerLedgerEntry" ADD CONSTRAINT "PartnerLedgerEntry_partnerLabId_fkey" FOREIGN KEY ("partnerLabId") REFERENCES "PartnerLab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerLedgerEntry" ADD CONSTRAINT "PartnerLedgerEntry_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CultureResult" ADD CONSTRAINT "CultureResult_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CultureResult" ADD CONSTRAINT "CultureResult_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CultureSensitivity" ADD CONSTRAINT "CultureSensitivity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CultureSensitivity" ADD CONSTRAINT "CultureSensitivity_cultureResultId_fkey" FOREIGN KEY ("cultureResultId") REFERENCES "CultureResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Antibiotic" ADD CONSTRAINT "Antibiotic_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcMaterial" ADD CONSTRAINT "QcMaterial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcMaterial" ADD CONSTRAINT "QcMaterial_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "TestParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcRun" ADD CONSTRAINT "QcRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcRun" ADD CONSTRAINT "QcRun_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "QcMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestConsumable" ADD CONSTRAINT "TestConsumable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestConsumable" ADD CONSTRAINT "TestConsumable_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestConsumable" ADD CONSTRAINT "TestConsumable_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analyzer" ADD CONSTRAINT "Analyzer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyzerMapping" ADD CONSTRAINT "AnalyzerMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyzerMapping" ADD CONSTRAINT "AnalyzerMapping_analyzerId_fkey" FOREIGN KEY ("analyzerId") REFERENCES "Analyzer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyzerMapping" ADD CONSTRAINT "AnalyzerMapping_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "TestParameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyzerMessage" ADD CONSTRAINT "AnalyzerMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyzerMessage" ADD CONSTRAINT "AnalyzerMessage_analyzerId_fkey" FOREIGN KEY ("analyzerId") REFERENCES "Analyzer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

