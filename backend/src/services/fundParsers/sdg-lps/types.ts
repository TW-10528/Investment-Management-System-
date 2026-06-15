// Typed shape of the rich SDGs 投資事業有限責任組合 (SDG LPS) report.
//
// TypeScript port of the JSON produced by the reference Python module
// `sdg_lps_module.py` (extract_sdg_lps_report). Currency is JPY — no FX
// conversion is performed. Stored on Notice.extractedData.fundReport (PostgreSQL
// JSON) and shown on the same per-document detail panel the other rich funds use.

export interface SdgBreakdownItem {
  purpose:     string
  label:       string
  amount:      number
  currency:    string
  excel_usage: string
}

export interface SdgBreakdown {
  capital_call_breakdown: SdgBreakdownItem[]
  distribution_breakdown: SdgBreakdownItem[]
}

export interface SdgAllFields {
  document_type:               string
  is_capital_call:             boolean
  is_distribution:             boolean
  fund_name:                   string
  company_name:                string
  currency:                    string

  notice_date:                 string | null
  transaction_date:            string | null
  filename_date:               string | null

  payment_amount:              number | null
  payment_due_date:            string | null
  current_unfunded_commitment: number | null
  remaining_after_payment:     number | null
  distribution_amount_from_text: number | null

  capital_contribution_amount_for_excel:  number
  distribution_amount_received_for_excel: number
  reinvestable_amount_for_excel:          number

  return_of_capital:           number
  gain:                        number
  interest_other:              number
  remarks:                     string

  ocr_or_pdf_text_length:      number
}

export interface SdgExcelFields {
  subscription_agreement_effective_date: string | null
  commitment_amount:                     number | null
  transaction_date:                      string | null
  mufg_ttm:                              number | null

  capital_contribution_amount:           number
  distribution_amount_received:          number
  reinvestable_amount:                   number

  cumulative_capital_contributions:      number | null
  remaining_commitment_formula_value:    number | null
  remaining_commitment:                  number | null

  cash_flow:                             number
  remarks:                               string | null
  distribution_details:                  SdgBreakdownItem[]
  distribution_not_allocated_to_reinvestment: number

  return_of_capital:                     number
  gain:                                  number
  interest:                              number
  interest_other:                        number

  current_unfunded_commitment:           number | null
  remaining_after_payment:               number | null

  // filled in by calculateExcelFields → extractSdgLpsReport
  current_transaction_cash_flow?:        number | null
  cumulative_cash_flow?:                 number | null
}

export interface SdgPreviousState {
  cumulative_capital_contributions?: number | null
  remaining_commitment?:             number | null
  cumulative_cash_flow?:             number | null
}

export interface SdgCalculatedFields {
  commitment_amount:                          number | null
  cumulative_capital_contributions:           number | null
  remaining_commitment_formula_value:         number | null
  remaining_commitment:                       number | null
  current_transaction_cash_flow:              number
  cumulative_cash_flow:                        number
  cash_flow_for_excel:                        number
  distribution_not_allocated_to_reinvestment: number
  remarks:                                    string | null
  distribution_details:                       SdgBreakdownItem[]
}

export interface SdgCalculationResult {
  input_values_for_current_row:     Record<string, unknown>
  previous_state_used:              SdgPreviousState | null
  calculated_excel_fields:          SdgCalculatedFields
  calculation_sources:              Record<string, string>
  final_excel_fields_for_frontend?: SdgExcelFields
}

export interface SdgValidation {
  missing_important_fields: string[]
  calculation_checks:       Record<string, unknown>
  needs_review:             boolean
  warnings:                 string[]
}

export interface SdgLpsReport {
  source_file_name:     string
  extraction_status:    string
  module_name:          string
  document_type:        string
  company_name:         string
  fund_name:            string
  currency:             string
  excel_fields:         SdgExcelFields
  all_extracted_fields: SdgAllFields
  breakdown:            SdgBreakdown
  validation:           SdgValidation
  calculation_result:   SdgCalculationResult
  final_excel_fields:   SdgExcelFields
}
