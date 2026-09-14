-- How printed reports are laid out: header and footer on paper, page margins, font and size.
ALTER TABLE "Tenant" ADD COLUMN "reportShowHeader" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "reportShowFooter" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "reportTopMarginMm" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN "reportBottomMarginMm" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN "reportFont" TEXT NOT NULL DEFAULT 'DEFAULT',
ADD COLUMN "reportFontScale" INTEGER NOT NULL DEFAULT 100;
