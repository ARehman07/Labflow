-- Notifications carry where they lead and what kind they are.

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'INFO',
ADD COLUMN     "link" TEXT;

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

