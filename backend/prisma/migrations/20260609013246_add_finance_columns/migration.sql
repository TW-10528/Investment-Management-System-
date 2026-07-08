-- AlterTable
ALTER TABLE "capital_calls" ADD COLUMN     "commitment_id" TEXT,
ADD COLUMN     "gain_usd" DECIMAL(20,6) DEFAULT 0,
ADD COLUMN     "interest_usd" DECIMAL(20,6) DEFAULT 0,
ADD COLUMN     "return_of_capital_usd" DECIMAL(20,6) DEFAULT 0;

-- AlterTable
ALTER TABLE "distributions" ADD COLUMN     "commitment_id" TEXT,
ADD COLUMN     "gain_usd" DECIMAL(20,6) DEFAULT 0,
ADD COLUMN     "interest_usd" DECIMAL(20,6) DEFAULT 0,
ADD COLUMN     "return_of_capital_usd" DECIMAL(20,6) DEFAULT 0;

-- AlterTable
ALTER TABLE "notices" ADD COLUMN     "commitment_id" TEXT;

-- CreateTable
CREATE TABLE "commitments" (
    "id" TEXT NOT NULL,
    "fund_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "commitment_usd" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "commitment_date" DATE,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commitments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_calls" ADD CONSTRAINT "capital_calls_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "commitments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "commitments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
