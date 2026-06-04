// Typed shape of the rich NB Real Estate report.
//
// TypeScript port of the JSON produced by the reference Python module
// `nb_realestate_module_updated.py` (extract_nb_realestate_report).
// The whole object is stored on Notice.extractedData.nbReport (PostgreSQL JSON)
// and surfaced on the frontend's per-document detail panel.

// One line of the capital-call / distribution itemisation.
export interface NbBreakdownItem {
  purpose:     string
  label:       string
  amount:      number
  excel_usage: string
}

export interface NbBreakdown {
  capital_call_breakdown: NbBreakdownItem[]
  distribution_breakdown: NbBreakdownItem[]
}

// Everything pulled straight off the PDF (label-anchored), pre-mapping.
export interface NbAllFields {
  notice_date:                                                  string | null
  payment_date:                                                 string | null
  amount_due:                                                   number | null
  limited_partner_commitment:                                   number | null
  percent_of_capital_commitment_called:                         number | null
  limited_partner_share_of_capital_contribution:                number | null
  capital_contribution_for_investments:                         number | null
  capital_contribution_for_partnership_expenses:                number | null
  management_fee_amount:                                        number | null
  management_fee_rebate:                                        number
  net_management_fee:                                           number
  additional_payment_due_to_subsequent_closing:                number | null
  additional_payment_received:                                  number
  annual_fee_rate_percent:                                      number | null
  fund_distributable_proceeds_from_investments:                 number | null
  limited_partner_share_of_distributable_proceeds:              number | null
  tax_expense:                                                  number
  amount_due_from_limited_partner:                              number | null
  original_commitment:                                          number | null
  inception_to_date_contributions:                              number | null
  inception_to_date_distributable_proceeds_subject_to_reinvestment: number | null
  remaining_commitment:                                         number | null
  inception_to_date_distributions:                              number | null
  current_gross_capital_contribution:                           number | null
  current_distribution_amount:                                  number
  current_reinvestable_amount:                                  number
  bank_name:                                                    string | null
  account_name:                                                 string | null
  reference:                                                    string | null
}

// The company-standard "Excel" row (B/C/D/E/F/G + audit extras).
export interface NbExcelFields {
  subscription_agreement_effective_date:        string | null
  commitment_amount:                            number | null
  transaction_date:                             string | null
  capital_contribution_amount:                  number
  distribution_amount_received:                 number
  reinvestable_amount:                          number
  cumulative_capital_contributions:             number | null
  remaining_commitment_formula_value:           number | null
  remaining_commitment:                         number | null
  cash_flow:                                    number
  remarks:                                      string
  distribution_details:                         NbBreakdownItem[]
  distribution_not_allocated_to_reinvestment:   number
  tax_expense:                                  number
  amount_due_from_limited_partner:              number
  management_fee_rebate:                        number
  net_management_fee:                           number
  additional_payment_due_to_subsequent_closing: number | null
  additional_payment_received:                  number
  // filled in by calculateExcelFields → extractNbRealestateReport
  current_transaction_cash_flow?:               number | null
  cumulative_cash_flow?:                        number | null
}

// Previous DB row's cumulative values (drives the cumulative formulas).
export interface NbPreviousState {
  cumulative_capital_contributions?: number | null
  remaining_commitment?:             number | null
  cumulative_cash_flow?:             number | null
}

export interface NbCalculatedFields {
  cumulative_capital_contributions:           number | null
  remaining_commitment_formula_value:         number | null
  remaining_commitment:                       number | null
  current_transaction_cash_flow:              number
  cumulative_cash_flow:                       number | null
  cash_flow_for_excel:                        number
  distribution_not_allocated_to_reinvestment: number
  remarks:                                    string | null
  distribution_details:                       NbBreakdownItem[]
  tax_expense:                                number
  amount_due_from_limited_partner:            number
}

export interface NbCalculationResult {
  input_values_for_current_row: Record<string, unknown>
  previous_state_used:          NbPreviousState | null
  calculated_excel_fields:      NbCalculatedFields
  calculation_sources:          Record<string, string>
  final_excel_fields_for_frontend?: NbExcelFields
}

export interface NbValidation {
  missing_excel_fields: string[]
  matched_excel_fields: string[]
  calculation_checks:   Record<string, unknown>
  needs_review:         boolean
  warnings:             string[]
}

export interface NbRealEstateReport {
  source_file_name:     string
  extraction_status:    string
  module_name:          string
  document_type:        string
  company_name:         string | null
  fund_name:            string
  currency:             string
  excel_fields:         NbExcelFields
  all_extracted_fields: NbAllFields
  breakdown:            NbBreakdown
  validation:           NbValidation
  calculation_result:   NbCalculationResult
  final_excel_fields:   NbExcelFields
}
