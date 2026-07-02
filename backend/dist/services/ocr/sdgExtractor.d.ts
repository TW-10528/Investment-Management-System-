/**
 * SDGs 投資事業有限責任組合 (SDG Fund) OCR/text extraction module
 *
 * Port of Python reference implementation for extracting SDG capital call
 * and distribution notices from PDFs.
 *
 * Key logic:
 * - Document type detection (capital call vs distribution)
 * - Japanese field extraction with flexible OCR patterns
 * - SDG-specific commitment change tracking
 * - Previous state handling for cumulative calculations
 */
export interface SDGExtractedFields {
    document_type: 'distribution_notice' | 'capital_call_notice' | 'unknown_sdg_notice';
    is_capital_call: boolean;
    is_distribution: boolean;
    fund_name: string;
    company_name: string;
    currency: string;
    notice_date: string | null;
    transaction_date: string | null;
    filename_date: string | null;
    payment_amount: number | null;
    payment_due_date: string | null;
    current_unfunded_commitment: number | null;
    remaining_after_payment: number | null;
    distribution_amount_from_text: number | null;
    capital_contribution_amount_for_excel: number;
    distribution_amount_received_for_excel: number;
    reinvestable_amount_for_excel: number;
    return_of_capital: number;
    gain: number;
    interest_other: number;
    remarks: string;
    ocr_or_pdf_text_length: number;
}
export declare function extractAllFields(text: string, fileName?: string): SDGExtractedFields;
export interface SDGPreviousState {
    cumulative_capital_contributions?: number;
    remaining_commitment?: number;
    cumulative_cash_flow?: number;
}
export interface SDGCalculationResult {
    commitment_amount: number | null;
    cumulative_capital_contributions: number | null;
    remaining_commitment: number | null;
    current_transaction_cash_flow: number;
    cumulative_cash_flow: number;
    cash_flow_for_excel: number;
    distribution_not_allocated_to_reinvestment: number;
    calculation_sources: Record<string, string>;
}
export declare function calculateExcelFields(extractedFields: SDGExtractedFields, previousState?: SDGPreviousState | null): SDGCalculationResult;
export interface SDGExtractionResult {
    source_file_name: string;
    extraction_status: 'success' | 'error';
    module_name: string;
    document_type: 'distribution_notice' | 'capital_call_notice' | 'unknown_sdg_notice';
    company_name: string;
    fund_name: string;
    currency: 'JPY';
    extracted_fields: SDGExtractedFields;
    calculation_result: SDGCalculationResult;
    validation: {
        missing_fields: string[];
        needs_review: boolean;
        warnings: string[];
    };
}
export declare function extractSDGReport(text: string, fileName?: string, previousState?: SDGPreviousState | null): SDGExtractionResult;
//# sourceMappingURL=sdgExtractor.d.ts.map