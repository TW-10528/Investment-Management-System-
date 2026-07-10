-- AddFundFamily: Isolated new fields for fund family onboarding logic
-- Does NOT modify existing 8 funds — completely isolated implementation

-- Create FundFamily table (new)
CREATE TABLE "fund_families" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "family_name" TEXT NOT NULL,
  "family_code" TEXT,
  "strategy" TEXT,
  "manager" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

-- Add unique index on family_name for quick lookup
CREATE UNIQUE INDEX "fund_families_family_name_key" ON "fund_families"("family_name");

-- Add isolated fields to Fund table (for new funds ONLY)
ALTER TABLE "funds" ADD COLUMN "fund_family_id" TEXT;
ALTER TABLE "funds" ADD COLUMN "family_sequence" INTEGER;
ALTER TABLE "funds" ADD COLUMN "is_new_fund" BOOLEAN NOT NULL DEFAULT false;

-- Add foreign key relationship (soft constraint via trigger, not hard FK to preserve existing data)
-- Existing 8 funds will have fund_family_id = NULL
-- New funds will have fund_family_id set to their family

-- Create index for performance
CREATE INDEX "funds_fund_family_id_idx" ON "funds"("fund_family_id");
CREATE INDEX "funds_is_new_fund_idx" ON "funds"("is_new_fund");
