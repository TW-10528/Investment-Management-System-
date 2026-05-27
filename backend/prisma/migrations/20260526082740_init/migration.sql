-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'board_member', 'finance_staff', 'finance_manager', 'admin');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending', 'active', 'inactive');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('pending', 'approved', 'paid', 'cancelled');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT,
    "full_name_jp" TEXT,
    "hashed_password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "status" "UserStatus" NOT NULL DEFAULT 'pending',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funds" (
    "id" TEXT NOT NULL,
    "fund_name" TEXT NOT NULL,
    "fund_name_jp" TEXT,
    "manager" TEXT,
    "administrator" TEXT,
    "strategy" TEXT,
    "vintage_year" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "commitment_usd" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "commitment_jpy" BIGINT,
    "entry_fx_rate" DECIMAL(12,6),
    "contract_date" DATE,
    "investment_period_start" DATE,
    "investment_period_end" DATE,
    "fund_term_years" INTEGER,
    "management_fee_pct" DECIMAL(8,4) DEFAULT 0,
    "carry_pct" DECIMAL(8,4) DEFAULT 0,
    "hurdle_rate_pct" DECIMAL(8,4) DEFAULT 0,
    "wire_bank" TEXT,
    "wire_account_name" TEXT,
    "wire_account_number" TEXT,
    "wire_aba" TEXT,
    "wire_swift" TEXT,
    "wire_reference" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capital_calls" (
    "id" TEXT NOT NULL,
    "fund_id" TEXT NOT NULL,
    "notice_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "execution_date" DATE,
    "call_number" INTEGER,
    "call_pct" DECIMAL(8,6) DEFAULT 0,
    "gross_call_usd" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "distribution_usd" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "reinvestable_usd" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "net_call_usd" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "fx_rate" DECIMAL(12,6),
    "net_call_jpy" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "investment_amount_usd" DECIMAL(20,6) DEFAULT 0,
    "management_fee_usd" DECIMAL(20,6) DEFAULT 0,
    "expense_usd" DECIMAL(20,6) DEFAULT 0,
    "status" "CallStatus" NOT NULL DEFAULT 'pending',
    "wire_reference" TEXT,
    "wire_fee_jpy" DECIMAL(12,2) DEFAULT 0,
    "is_recallable" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capital_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distributions" (
    "id" TEXT NOT NULL,
    "fund_id" TEXT NOT NULL,
    "distribution_date" DATE NOT NULL,
    "dist_type" TEXT NOT NULL,
    "amount_usd" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "amount_jpy" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "fx_rate" DECIMAL(12,6),
    "reinvestable_usd" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "is_recallable" BOOLEAN NOT NULL DEFAULT false,
    "recall_expiry" DATE,
    "is_recalled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_rates" (
    "id" TEXT NOT NULL,
    "rate_date" DATE NOT NULL,
    "usd_jpy" DECIMAL(12,6) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nav_records" (
    "id" TEXT NOT NULL,
    "fund_id" TEXT NOT NULL,
    "nav_date" DATE NOT NULL,
    "nav_usd" DECIMAL(20,6),
    "period" TEXT,
    "source_notice_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nav_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_targets" (
    "id" TEXT NOT NULL,
    "fund_id" TEXT NOT NULL,
    "project_name" TEXT,
    "actual_name" TEXT,
    "investment_date" DATE,
    "amount_usd" DECIMAL(20,6),
    "investment_type" TEXT,
    "sector" TEXT,
    "geography" TEXT,
    "deal_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "original_name" TEXT,
    "notice_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "fund_id" TEXT,
    "extracted_data" JSONB,
    "confidence" DOUBLE PRECISION,
    "admin_notes" TEXT,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "record_id" TEXT,
    "user_email" TEXT,
    "user_id" TEXT,
    "old_values" JSONB,
    "new_values" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "capital_calls" ADD CONSTRAINT "capital_calls_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nav_records" ADD CONSTRAINT "nav_records_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_targets" ADD CONSTRAINT "investment_targets_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_fund_id_fkey" FOREIGN KEY ("fund_id") REFERENCES "funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
