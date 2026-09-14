-- Time limits and report defaults set by the lab owner.
ALTER TABLE "Tenant" ADD COLUMN "resultEditLockMins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "refundWindowHours" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "reportHistoryColumns" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "reportHistoryByDefault" BOOLEAN NOT NULL DEFAULT false;
