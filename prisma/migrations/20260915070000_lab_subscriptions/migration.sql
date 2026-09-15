-- Each lab's LabFlow subscription, set from the platform console, and the payments against it.
ALTER TABLE "Tenant" ADD COLUMN "planName" TEXT,
ADD COLUMN "monthlyFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "paidUntil" TIMESTAMP(3),
ADD COLUMN "graceDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN "maxUsers" INTEGER,
ADD COLUMN "accessOverride" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN "overrideUntil" TIMESTAMP(3),
ADD COLUMN "lockedFeatures" TEXT NOT NULL DEFAULT '[]';

CREATE TABLE "LabPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "months" INTEGER NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "method" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "recordedBy" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LabPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LabPayment_tenantId_idx" ON "LabPayment"("tenantId");

ALTER TABLE "LabPayment" ADD CONSTRAINT "LabPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
