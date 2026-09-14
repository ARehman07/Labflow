-- Which parts of LabFlow a lab uses, and whether a price list is offered at the counter.
ALTER TABLE "Tenant" ADD COLUMN "features" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "RateGroup" ADD COLUMN "atCounter" BOOLEAN NOT NULL DEFAULT true;
