export interface HamiltonBreakdownItem {
    purpose: string;
    label: string;
    amount: number;
    excel_usage: string;
    recallable_amount?: number;
}
export interface HamiltonBreakdown {
    capital_call_breakdown: HamiltonBreakdownItem[];
    distribution_breakdown: HamiltonBreakdownItem[];
}
export interface HamiltonAllFields {
    document_type: string;
    notice_date: string | null;
    transaction_date: string | null;
    capital_call_due_date: string | null;
    distribution_due_date: string | null;
    capital_call_amount_header: number | null;
    distribution_amount_header: number | null;
    transaction_total_signed: number | null;
    transaction_total_abs: number | null;
    capital_call_for_investments: number | null;
    capital_call_for_management_fees: number | null;
    capital_call_for_expenses: number | null;
    subsequent_close_interest_payable: number | null;
    subsequent_close_interest_receivable: number | null;
    capital_commitment: number | null;
    amounts_drawn: number | null;
    recallable_amounts_distributed: number;
    remaining_unfunded_commitment: number | null;
    cumulative_distributions: number;
    distribution_return_of_capital: number | null;
    distribution_return_of_capital_recallable: number | null;
    distribution_investment_income: number | null;
    distribution_investment_income_recallable: number | null;
    distribution_realized_gain: number | null;
    distribution_realized_gain_recallable: number | null;
    return_of_capital_total: number;
    investment_income_total: number;
    realized_gain_total: number;
    capital_contribution_amount: number;
    distribution_amount_received: number;
    reinvestable_amount: number;
    distribution_not_allocated_to_reinvestment: number;
    actual_payment_amount: number;
    actual_distribution_amount: number;
    bank_name: string | null;
    aba_number: string | null;
    swift_code: string | null;
    account_number: string | null;
    account_name: string | null;
    reference: string | null;
}
export interface HamiltonExcelFields {
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
    distribution_details: HamiltonBreakdownItem[];
    distribution_not_allocated_to_reinvestment: number | null;
    return_of_capital: number | null;
    gain: number | null;
    interest_other: number | null;
    subsequent_close_interest_payable: number;
    subsequent_close_interest_receivable: number;
    actual_payment_amount: number;
    actual_distribution_amount: number;
    current_transaction_cash_flow?: number | null;
    cumulative_cash_flow?: number | null;
}
export interface HamiltonPreviousState {
    cumulative_capital_contributions?: number | null;
    remaining_commitment?: number | null;
    cumulative_cash_flow?: number | null;
}
export interface HamiltonCalculatedFields {
    cumulative_capital_contributions: number | null;
    remaining_commitment_formula_value: number | null;
    remaining_commitment: number | null;
    current_transaction_cash_flow: number;
    cumulative_cash_flow: number | null;
    cash_flow_for_excel: number;
    distribution_not_allocated_to_reinvestment: number;
    remarks: string | null;
    distribution_details: HamiltonBreakdownItem[];
    return_of_capital: number | null;
    gain: number | null;
    interest_other: number | null;
    subsequent_close_interest_payable: number;
    subsequent_close_interest_receivable: number;
    actual_payment_amount: number;
    actual_distribution_amount: number;
}
export interface HamiltonCalculationResult {
    input_values_for_current_row: Record<string, unknown>;
    previous_state_used: HamiltonPreviousState | null;
    calculated_excel_fields: HamiltonCalculatedFields;
    calculation_sources: Record<string, string>;
    final_excel_fields_for_frontend?: HamiltonExcelFields;
}
export interface HamiltonValidation {
    missing_excel_fields: string[];
    matched_excel_fields: string[];
    calculation_checks: Record<string, unknown>;
    needs_review: boolean;
    warnings: string[];
}
export interface HamiltonLaneReport {
    source_file_name: string;
    extraction_status: string;
    module_name: string;
    document_type: string;
    company_name: string | null;
    fund_name: string;
    currency: string;
    excel_fields: HamiltonExcelFields;
    all_extracted_fields: HamiltonAllFields;
    breakdown: HamiltonBreakdown;
    validation: HamiltonValidation;
    calculation_result: HamiltonCalculationResult;
    final_excel_fields: HamiltonExcelFields;
}
//# sourceMappingURL=types.d.ts.map