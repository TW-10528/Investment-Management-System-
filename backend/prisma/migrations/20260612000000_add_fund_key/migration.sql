-- Add fund_key column to funds table for dynamic AI classification
ALTER TABLE "funds" ADD COLUMN "fund_key" TEXT;
ALTER TABLE "funds" ADD CONSTRAINT "funds_fund_key_key" UNIQUE ("fund_key");

-- Backfill existing 8 funds with their known keys
UPDATE "funds" SET "fund_key" = 'nb-real-estate'    WHERE "fund_name" ILIKE '%NB Real Estate%';
UPDATE "funds" SET "fund_key" = 'hamilton-lane'      WHERE "fund_name" ILIKE '%Hamilton Lane Secondary%' AND "fund_name" NOT ILIKE '%Strategic%';
UPDATE "funds" SET "fund_key" = 'hamilton-strategic' WHERE "fund_name" ILIKE '%Hamilton Lane Strategic%' OR "fund_name" ILIKE '%Strategic Opportunities%';
UPDATE "funds" SET "fund_key" = 'dover-street'       WHERE "fund_name" ILIKE '%Dover Street%';
UPDATE "funds" SET "fund_key" = 'sdg-lps'            WHERE "fund_name" ILIKE '%SDG%';
UPDATE "funds" SET "fund_key" = 'goldman-sachs'      WHERE "fund_name" ILIKE '%Goldman%' OR "fund_name" ILIKE '%Vintage X%';
UPDATE "funds" SET "fund_key" = 'siguler-guff'       WHERE "fund_name" ILIKE '%Siguler%';
UPDATE "funds" SET "fund_key" = 'capula-grv'         WHERE "fund_name" ILIKE '%Capula%';
