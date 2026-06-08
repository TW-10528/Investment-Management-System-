// Goldman Sachs Vintage X (Flagship) Offshore SCSp — type definitions.

export interface GoldmanAllFields {
  notice_date: string | null
  due_date: string | null
  commitment_amount: number | null
  total_commitment: number | null
  secondary_investments: number | null
  gross_contribution: number | null
  contributions_to_date: number | null
  outstanding_commitment: number | null
  funding_amount: number | null
  currency_from_instruction: string | null
  recipient_bank_name: string | null
  aba_number: string | null
  recipient_account_name: string | null
  recipient_account_number: string | null
  reference: string | null
  bic_code: string | null
}

export interface GoldmanBreakdownItem {
  purpose: string
  label: string
  amount: number
  excel_usage: string
}

export interface GoldmanBreakdown {
  capital_call_breakdown: GoldmanBreakdownItem[]
  distribution_breakdown: GoldmanBreakdownItem[]
}

export interface GoldmanExcelFields {
  subscription_agreement_effective_date: null
  commitment_amount: number | null
  transaction_date: string | null
  capital_contribution_amount: number
  distribution_amount_received: number
  reinvestable_amount: number
  cumulative_capital_contributions: number | null
  remaining_commitment_formula_value: number | null
  remaining_commitment: number | null
  cash_flow: number
  remarks: string
  distribution_details: GoldmanBreakdownItem[]
  distribution_not_allocated_to_reinvestment: number
  current_transaction_cash_flow?: number | null
  cumulative_cash_flow?: number | null
}

export interface GoldmanCalculatedFields {
  cumulative_capital_contributions: number | null
  remaining_commitment_formula_value: number | null
  remaining_commitment: number | null
  current_transaction_cash_flow: number
  cumulative_cash_flow: number | null
  cash_flow_for_excel: number
  distribution_not_allocated_to_reinvestment: number
  remarks: string | undefined
  distribution_details: GoldmanBreakdownItem[]
}

export interface GoldmanCalculationResult {
  input_values_for_current_row: {
    subscription_agreement_effective_date: null
    commitment_amount: number | null
    transaction_date: string | null
    capital_contribution_amount: number
    distribution_amount_received: number
    reinvestable_amount: number
  }
  previous_state_used: GoldmanPreviousState | null
  calculated_excel_fields: GoldmanCalculatedFields
  calculation_sources: Record<string, string>
}

export interface GoldmanPreviousState {
  cumulative_capital_contributions?: number | null
  remaining_commitment?: number | null
  cumulative_cash_flow?: number | null
}

export interface GoldmanValidation {
  missing_excel_fields: string[]
  matched_excel_fields: string[]
  calculation_checks: Record<string, unknown>
  needs_review: boolean
  warnings: string[]
}

export interface GoldmanReport {
  source_file_name: string
  extraction_status: 'success' | 'error'
  module_name: string
  document_type: string
  company_name: string | null
  fund_name: string
  currency: string
  excel_fields: GoldmanExcelFields
  all_extracted_fields: GoldmanAllFields
  breakdown: GoldmanBreakdown
  validation: GoldmanValidation
  calculation_result: GoldmanCalculationResult & { final_excel_fields_for_frontend: GoldmanExcelFields }
  final_excel_fields: GoldmanExcelFields
}
