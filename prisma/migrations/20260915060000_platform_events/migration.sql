-- What platform admins did to labs. Not tied to a lab, so it outlives one that was removed.
CREATE TABLE "PlatformEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "admin" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "labId" TEXT,
    "labCode" TEXT NOT NULL,
    "detail" TEXT,
    CONSTRAINT "PlatformEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformEvent_labId_idx" ON "PlatformEvent"("labId");
CREATE INDEX "PlatformEvent_at_idx" ON "PlatformEvent"("at");
