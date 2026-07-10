-- CreateTable
CREATE TABLE "fund_templates" (
    "id" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "fundKey" TEXT NOT NULL,
    "manager" TEXT,
    "fund_name_jp" TEXT,
    "strategy" TEXT,
    "extractionSchema" JSONB NOT NULL,
    "sample_count" INTEGER NOT NULL DEFAULT 1,
    "last_updated" TIMESTAMP(3) NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fund_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pdf_labels" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "extraction_date" TIMESTAMP(3) NOT NULL,
    "extracted_by" TEXT,
    "pdf_storage_path" TEXT,
    "validation_log" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pdf_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_sessions" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "fund_key" TEXT,
    "fund_display_name" TEXT,
    "report_type" TEXT,
    "ai_confidence" DOUBLE PRECISION,
    "extracted_values" JSONB,
    "user_edited_values" JSONB,
    "calculated_values" JSONB,
    "validation_results" JSONB,
    "template_id" TEXT,
    "is_new_template" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "error_message" TEXT,
    "user_id" TEXT,
    "user_email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_feedback" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "corrected_fields" TEXT[],
    "original_values" JSONB NOT NULL,
    "corrected_values" JSONB NOT NULL,
    "feedback" TEXT,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "ai_analysis" JSONB,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correction_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fund_templates_fundKey_key" ON "fund_templates"("fundKey");

-- CreateIndex
CREATE INDEX "pdf_labels_template_id_idx" ON "pdf_labels"("template_id");

-- CreateIndex
CREATE INDEX "pdf_labels_fileHash_idx" ON "pdf_labels"("fileHash");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_sessions_file_hash_key" ON "onboarding_sessions"("file_hash");

-- CreateIndex
CREATE INDEX "onboarding_sessions_file_hash_idx" ON "onboarding_sessions"("file_hash");

-- CreateIndex
CREATE INDEX "onboarding_sessions_user_email_idx" ON "onboarding_sessions"("user_email");

-- CreateIndex
CREATE INDEX "onboarding_sessions_status_idx" ON "onboarding_sessions"("status");

-- AddForeignKey
ALTER TABLE "pdf_labels" ADD CONSTRAINT "pdf_labels_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "fund_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
