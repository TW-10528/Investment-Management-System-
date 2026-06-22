-- AlterTable
ALTER TABLE "capital_calls" ADD COLUMN     "unfunded_after_call_usd" DECIMAL(20,2);

-- CreateTable
CREATE TABLE "fund_commitment_history" (
    "id" TEXT NOT NULL,
    "fund_id" TEXT NOT NULL,
    "commitment_amount" DECIMAL(20,2) NOT NULL,
    "effective_date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fund_commitment_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fund_commitment_history_fund_id_effective_date_idx" ON "fund_commitment_history"("fund_id", "effective_date");

-- AddForeignKey
ALTER TABLE "fund_commitment_history" ADD CONSTRAINT "fund_commitment_history_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
