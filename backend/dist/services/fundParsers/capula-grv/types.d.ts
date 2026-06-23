export interface CapulaAllFields {
    tran_type: string | null;
    contract_no: string | null;
    fund_code: string | null;
    series_id: string | null;
    entity_id: string | null;
    sub_entity_id: string | null;
    notice_date: string | null;
    valuation_nav_date: string | null;
    trade_date: string | null;
    transaction_date: string | null;
    filename_date: string | null;
    is_subscription: boolean;
    is_distribution: boolean;
    shares_issued: number | null;
    subscription_price: number | null;
    net_capital_contribution: number | null;
    total_consideration_received: number | null;
    capital_balance: number | null;
    distribution: number | null;
    share_balance_to_date: number | null;
    commitment_amount: number | null;
    capital_contribution_amount_for_excel: number;
    distribution_amount_received_for_excel: number;
    reinvestable_amount_for_excel: number;
    report_cumulative_capital_contributions: number | null;
    report_remaining_commitment: number | null;
}
export interface CapulaBreakdownItem {
    purpose: string;
    label: string;
    amount: number;
    excel_usage: string;
}
export interface CapulaBreakdown {
    capital_call_breakdown: CapulaBreakdownItem[];
    distribution_breakdown: CapulaBreakdownItem[];
}
export interface CapulaExcelFields {
    subscription_agreement_effective_date: null;
    commitment_amount: number | null;
    transaction_date: string | null;
    mufg_ttm: null;
    capital_contribution_amount: number;
    distribution_amount_received: number;
    reinvestable_amount: number;
    cumulative_capital_contributions: number | null;
    remaining_commitment_formula_value: number | null;
    remaining_commitment: number | null;
    cash_flow: number;
    remarks: string;
    distribution_details: CapulaBreakdownItem[];
    distribution_not_allocated_to_reinvestment: number;
    capital_balance: number | null;
    share_balance_to_date: number | null;
    shares_issued: number | null;
    subscription_price: number | null;
    current_transaction_cash_flow?: number | null;
    cumulative_cash_flow?: number | null;
}
export interface CapulaCalculatedFields {
    cumulative_capital_contributions: number | null;
    remaining_commitment_formula_value: number | null;
    remaining_commitment: number | null;
    current_transaction_cash_flow: number;
    cumulative_cash_flow: number;
    cash_flow_for_excel: number;
    distribution_not_allocated_to_reinvestment: number;
    remarks: string | undefined;
    distribution_details: CapulaBreakdownItem[];
    capital_balance: number | null;
    share_balance_to_date: number | null;
}
export interface CapulaCalculationResult {
    input_values_for_current_row: {
        subscription_agreement_effective_date: null;
        commitment_amount: number | null;
        transaction_date: string | null;
        capital_contribution_amount: number;
        distribution_amount_received: number;
        reinvestable_amount: number;
        capital_balance: number | null;
        share_balance_to_date: number | null;
    };
    previous_state_used: CapulaPreviousState | null;
    calculated_excel_fields: CapulaCalculatedFields;
    calculation_sources: Record<string, string>;
}
export interface CapulaPreviousState {
    cumulative_capital_contributions?: number | null;
    remaining_commitment?: number | null;
    cumulative_cash_flow?: number | null;
}
export interface CapulaValidation {
    missing_excel_fields: string[];
    matched_excel_fields: string[];
    calculation_checks: Record<string, unknown>;
    needs_review: boolean;
    warnings: string[];
}
export interface CapulaReport {
    source_file_name: string;
    extraction_status: 'success' | 'error';
    module_name: string;
    document_type: string;
    company_name: string | null;
    fund_name: string;
    currency: string;
    excel_fields: CapulaExcelFields;
    all_extracted_fields: CapulaAllFields;
    breakdown: CapulaBreakdown;
    validation: CapulaValidation;
    calculation_result: CapulaCalculationResult & {
        final_excel_fields_for_frontend: CapulaExcelFields;
    };
    final_excel_fields: CapulaExcelFields;
}
//# sourceMappingURL=types.d.ts.map