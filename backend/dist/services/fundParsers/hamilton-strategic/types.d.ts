export interface HamStratBreakdownItem {
    purpose: string;
    label: string;
    amount: number;
    excel_usage: string;
}
export interface HamStratBreakdown {
    capital_call_breakdown: HamStratBreakdownItem[];
    distribution_breakdown: HamStratBreakdownItem[];
}
export interface HamStratAllFields {
    notice_date: string | null;
    capital_call_due_date: string | null;
    distribution_due_date: string | null;
    transaction_date: string | null;
    capital_call_amount_header: number | null;
    distribution_amount_header: number | null;
    transaction_total: number | null;
    capital_commitment: number | null;
    amounts_drawn: number | null;
    recallable_amounts_distributed: number | null;
    remaining_unfunded_commitment: number | null;
    cumulative_distributions: number | null;
    capital_call_for_investments: number | null;
    capital_call_hl_so_ix_holdings: number | null;
    capital_call_leveraged_blocker: number | null;
    capital_call_management_fees: number | null;
    capital_call_expenses: number | null;
    total_capital_call: number | null;
    return_unused_capital_for_investments: number | null;
    total_distribution: number | null;
    accounting_total_distributions: number | null;
    repayment_of_principal: number | null;
    interest_income: number | null;
    other_investment_income: number | null;
    subsequent_close_interest_receivable: number | null;
    subsequent_close_interest_payable: number | null;
    capital_contribution_amount_for_excel: number;
    distribution_amount_received_for_excel: number;
    reinvestable_amount_for_excel: number;
    actual_payment_amount: number | null;
    actual_cash_flow_from_transaction_total: number | null;
    bank_name: string | null;
    aba_number: string | null;
    swift_code: string | null;
    account_number: string | null;
    account_name: string | null;
}
export interface HamStratExcelFields {
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
    distribution_details: HamStratBreakdownItem[];
    distribution_not_allocated_to_reinvestment: number;
    return_of_capital: number;
    gain: number;
    interest: number;
    interest_other: number;
    actual_payment_amount: number | null;
    actual_cash_flow_from_transaction_total: number | null;
    current_transaction_cash_flow?: number | null;
    cumulative_cash_flow?: number | null;
}
export interface HamStratPreviousState {
    cumulative_capital_contributions?: number | null;
    remaining_commitment?: number | null;
    cumulative_cash_flow?: number | null;
}
export interface HamStratCalculatedFields {
    cumulative_capital_contributions: number | null;
    remaining_commitment_formula_value: number | null;
    remaining_commitment: number | null;
    current_transaction_cash_flow: number;
    cumulative_cash_flow: number | null;
    cash_flow_for_excel: number;
    distribution_not_allocated_to_reinvestment: number;
    remarks: string | null;
    distribution_details: HamStratBreakdownItem[];
}
export interface HamStratCalculationResult {
    input_values_for_current_row: Record<string, unknown>;
    previous_state_used: HamStratPreviousState | null;
    calculated_excel_fields: HamStratCalculatedFields;
    calculation_sources: Record<string, string>;
    final_excel_fields_for_frontend?: HamStratExcelFields;
}
export interface HamStratValidation {
    missing_excel_fields: string[];
    matched_excel_fields: string[];
    calculation_checks: Record<string, unknown>;
    needs_review: boolean;
    warnings: string[];
}
export interface HamiltonStrategicReport {
    source_file_name: string;
    extraction_status: string;
    module_name: string;
    document_type: string;
    company_name: string | null;
    fund_name: string;
    currency: string;
    excel_fields: HamStratExcelFields;
    all_extracted_fields: HamStratAllFields;
    breakdown: HamStratBreakdown;
    validation: HamStratValidation;
    calculation_result: HamStratCalculationResult;
    final_excel_fields: HamStratExcelFields;
}
//# sourceMappingURL=types.d.ts.map