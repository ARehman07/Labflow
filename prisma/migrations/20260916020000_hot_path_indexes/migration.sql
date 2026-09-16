-- Foreign keys and hot filters Postgres does not index by itself. Each one
-- serves a query the lab runs constantly: the board, the bench, the till.

-- CreateIndex
CREATE INDEX "Visit_tenantId_branchId_bookedAt_idx" ON "Visit"("tenantId", "branchId", "bookedAt");

-- CreateIndex
CREATE INDEX "Sample_tenantId_visitId_specimenType_idx" ON "Sample"("tenantId", "visitId", "specimenType");

-- CreateIndex
CREATE INDEX "OrderLine_tenantId_visitId_status_idx" ON "OrderLine"("tenantId", "visitId", "status");

-- CreateIndex
CREATE INDEX "OrderLine_tenantId_status_dueAt_idx" ON "OrderLine"("tenantId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "WorkflowEvent_tenantId_toState_at_idx" ON "WorkflowEvent"("tenantId", "toState", "at");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_status_idx" ON "Invoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Payment_tenantId_invoiceId_idx" ON "Payment"("tenantId", "invoiceId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_at_idx" ON "Payment"("tenantId", "at");
