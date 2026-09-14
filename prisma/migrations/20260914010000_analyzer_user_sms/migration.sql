-- An analyzer's own results account, and SMS as a delivery channel.

-- AlterEnum
ALTER TYPE "DeliveryChannel" ADD VALUE 'SMS';

-- AlterTable
ALTER TABLE "Analyzer" ADD COLUMN     "userId" TEXT;

