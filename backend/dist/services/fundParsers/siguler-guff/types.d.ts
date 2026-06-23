export interface SigulerAllFields {
    notice_date: string | null;
    due_date: string | null;
    report_type: string | null;
    capital_call_percent: number | null;
    capital_call_amount: number | null;
    funded_after_call_percent: number | null;
    inferred_commitment_amount: number | null;
    inferred_cumulative_capital_contributions_after_call: number | null;
    inferred_remaining_commitment_after_call: number | null;
    beneficiary_bank: string | null;
    swift_code: string | null;
    aba_number: string | null;
    account_name: string | null;
    account_number: string | null;
    reference: string | null;
    batch_id: number | null;
    client_id: string | null;
    ext_investor_id: string | null;
}
export interface SigulerBreakdownItem {
    purpose: string;
    label: string;
    amount: number;
    excel_usage: string;
}
export interface SigulerBreakdown {
    capital_call_breakdown: SigulerBreakdownItem[];
    distribution_breakdown: SigulerBreakdownItem[];
}
export interface SigulerExcelFields {
    subscription_agreement_effective_date: null;
    commitment_amount: number | null;
    transaction_date: string | null;
    capital_contribution_amount: number;
    distribution_amount_received: number;
    reinvestable_amount: number;
    cumulative_capital_contributions: number | null;
    remaining_commitment_formula_value: number | null;
    remaining_commitment: number | null;
    cash_flow: number;
    remarks: string;
    distribution_details: SigulerBreakdownItem[];
    distribution_not_allocated_to_reinvestment: number;
    current_transaction_cash_flow?: number | null;
    cumulative_cash_flow?: number | null;
}
export interface SigulerCalculatedFields {
    cumulative_capital_contributions: number | null;
    remaining_commitment_formula_value: number | null;
    remaining_commitment: number | null;
    current_transaction_cash_flow: number;
    cumulative_cash_flow: number | null;
    cash_flow_for_excel: number;
    distribution_not_allocated_to_reinvestment: number;
    remarks: string | undefined;
    distribution_details: SigulerBreakdownItem[];
}
export interface SigulerCalculationResult {
    input_values_for_current_row: {
        subscription_agreement_effective_date: null;
        commitment_amount: number | null;
        transaction_date: string | null;
        capital_contribution_amount: number;
        distribution_amount_received: number;
        reinvestable_amount: number;
        capital_call_percent: number | null;
        funded_after_call_percent: number | null;
    };
    previous_state_used: SigulerPreviousState | null;
    calculated_excel_fields: SigulerCalculatedFields;
    calculation_sources: Record<string, string>;
}
export interface SigulerPreviousState {
    cumulative_capital_contributions?: number | null;
    remaining_commitment?: number | null;
    cumulative_cash_flow?: number | null;
}
export interface SigulerValidation {
    missing_excel_fields: string[];
    matched_excel_fields: string[];
    calculation_checks: Record<string, unknown>;
    needs_review: boolean;
    warnings: string[];
}
export interface SigulerReport {
    source_file_name: string;
    extraction_status: 'success' | 'error';
    module_name: string;
    document_type: string;
    company_name: string | null;
    fund_name: string;
    currency: string;
    excel_fields: SigulerExcelFields;
    all_extracted_fields: SigulerAllFields;
    breakdown: SigulerBreakdown;
    validation: SigulerValidation;
    calculation_result: SigulerCalculationResult & {
        final_excel_fields_for_frontend: SigulerExcelFields;
    };
    final_excel_fields: SigulerExcelFields;
}
//# sourceMappingURL=types.d.ts.map