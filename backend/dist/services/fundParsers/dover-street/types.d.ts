export interface DoverBreakdownItem {
    purpose: string;
    label: string;
    amount: number;
    excel_usage: string;
}
export interface DoverBreakdown {
    capital_call_breakdown: DoverBreakdownItem[];
    distribution_breakdown: DoverBreakdownItem[];
}
export interface DoverAllFields {
    notice_date: string | null;
    transaction_date: string | null;
    filename_date: string | null;
    is_initial_contribution: boolean;
    is_cash_distribution: boolean;
    is_capital_call_deemed_distribution: boolean;
    commitment_amount: number | null;
    capital_call_summary: number | null;
    amount_of_capital_call: number | null;
    less_deemed_distribution: number | null;
    net_amount_of_capital_call: number | null;
    gross_distribution: number | null;
    return_of_capital: number | null;
    gain: number | null;
    interest_other: number | null;
    net_distribution: number | null;
    total_distribution: number | null;
    total_capital_called: number | null;
    unfunded_commitment: number | null;
    total_distributions_including: number | null;
    capital_contribution_amount_for_excel: number;
    distribution_amount_received_for_excel: number;
    reinvestable_amount_for_excel: number;
    report_cumulative_capital_contributions: number | null;
    report_remaining_commitment: number | null;
    initial_total_interest: number | null;
    initial_total_due: number | null;
    actual_payment_amount: number | null;
    actual_cash_flow_from_report_payment: number | null;
    bank_name: string | null;
    aba_number: string | null;
    swift_code: string | null;
    account_name: string | null;
    account_number: string | null;
}
export interface DoverExcelFields {
    subscription_agreement_effective_date: string | null;
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
    distribution_details: DoverBreakdownItem[];
    distribution_not_allocated_to_reinvestment: number;
    return_of_capital: number | null;
    gain: number | null;
    interest: number | null;
    interest_other: number | null;
    actual_payment_amount: number | null;
    actual_cash_flow_from_report_payment: number | null;
    current_transaction_cash_flow?: number | null;
    cumulative_cash_flow?: number | null;
}
export interface DoverPreviousState {
    cumulative_capital_contributions?: number | null;
    remaining_commitment?: number | null;
    cumulative_cash_flow?: number | null;
}
export interface DoverCalculatedFields {
    cumulative_capital_contributions: number | null;
    remaining_commitment_formula_value: number | null;
    remaining_commitment: number | null;
    current_transaction_cash_flow: number;
    cumulative_cash_flow: number | null;
    cash_flow_for_excel: number;
    distribution_not_allocated_to_reinvestment: number;
    remarks: string | null;
    distribution_details: DoverBreakdownItem[];
    return_of_capital: number | null;
    gain: number | null;
    interest_other: number | null;
}
export interface DoverCalculationResult {
    input_values_for_current_row: Record<string, unknown>;
    previous_state_used: DoverPreviousState | null;
    calculated_excel_fields: DoverCalculatedFields;
    calculation_sources: Record<string, string>;
    final_excel_fields_for_frontend?: DoverExcelFields;
}
export interface DoverValidation {
    missing_excel_fields: string[];
    matched_excel_fields: string[];
    calculation_checks: Record<string, unknown>;
    needs_review: boolean;
    warnings: string[];
}
export interface DoverStreetReport {
    source_file_name: string;
    extraction_status: string;
    module_name: string;
    document_type: string;
    company_name: string | null;
    fund_name: string;
    currency: string;
    excel_fields: DoverExcelFields;
    all_extracted_fields: DoverAllFields;
    breakdown: DoverBreakdown;
    validation: DoverValidation;
    calculation_result: DoverCalculationResult;
    final_excel_fields: DoverExcelFields;
}
//# sourceMappingURL=types.d.ts.map