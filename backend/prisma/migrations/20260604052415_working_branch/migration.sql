-- AlterTable
ALTER TABLE "capital_calls" ADD COLUMN     "manual_cash_flow_usd" DECIMAL(20,6),
ADD COLUMN     "source_pdf_id" TEXT;

-- CreateTable
CREATE TABLE "fund_reports" (
    "id" TEXT NOT NULL,
    "fund_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "report_type" TEXT NOT NULL DEFAULT 'capital_call',
    "notice_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "batch_id" TEXT,
    "is_initial_call" BOOLEAN NOT NULL DEFAULT false,
    "call_pct" DECIMAL(8,6) NOT NULL DEFAULT 0,
    "net_call_usd" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "cumulative_pct" DECIMAL(8,6) NOT NULL DEFAULT 0,
    "commitment_usd" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "extracted_data" JSONB,
    "capital_call_id" TEXT,
    "processed_by" TEXT,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fund_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sigf_snapshots" (
    "id" TEXT NOT NULL,
    "fund_id" TEXT NOT NULL,
    "fund_code" TEXT NOT NULL,
    "pdf_count" INTEGER NOT NULL,
    "commitment_usd" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "cumulative_drawn" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "investment_capacity" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "net_cash_flow" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "non_recallable_dist" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "distributions_total" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "dpi" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "call_rows" JSONB NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sigf_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculation_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "formula" TEXT NOT NULL,
    "explanation" TEXT,
    "output_unit" TEXT,
    "applicable_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "display_on_dashboard" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calculation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribute_extractors" (
    "id" TEXT NOT NULL,
    "attribute_name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extraction_type" TEXT NOT NULL DEFAULT 'usd',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attribute_extractors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculation_results" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "notice_id" TEXT NOT NULL,
    "fund_id" TEXT,
    "input_values" JSONB,
    "output_value" DECIMAL(30,6),
    "output_text" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calculation_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_email" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fund_reports_capital_call_id_key" ON "fund_reports"("capital_call_id");

-- CreateIndex
CREATE UNIQUE INDEX "sigf_snapshots_fund_id_key" ON "sigf_snapshots"("fund_id");

-- AddForeignKey
ALTER TABLE "fund_reports" ADD CONSTRAINT "fund_reports_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sigf_snapshots" ADD CONSTRAINT "sigf_snapshots_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculation_results" ADD CONSTRAINT "calculation_results_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "calculation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
