-- Patient forms: templates the lab words, and the filled-in, printed documents with their signed scans.
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "docNo" INTEGER NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitId" TEXT,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "prints" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "scanFileName" TEXT,
    "scanMimeType" TEXT,
    "scanSize" INTEGER,
    "scanData" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PatientDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentTemplate_tenantId_idx" ON "DocumentTemplate"("tenantId");
CREATE UNIQUE INDEX "PatientDocument_tenantId_docNo_key" ON "PatientDocument"("tenantId", "docNo");
CREATE INDEX "PatientDocument_tenantId_idx" ON "PatientDocument"("tenantId");
CREATE INDEX "PatientDocument_patientId_idx" ON "PatientDocument"("patientId");

ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
