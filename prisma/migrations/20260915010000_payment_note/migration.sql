-- Why a payment was taken back (dues marked pending).
ALTER TABLE "Payment" ADD COLUMN "note" TEXT;
