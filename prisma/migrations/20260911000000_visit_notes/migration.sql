-- Comments on a booking: instructions for the lab, who referred the patient,
-- why a discount was given. The care-of discount they replace is retired but
-- its enum value and columns stay, because invoices raised with it reference
-- them.

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "notes" TEXT;
