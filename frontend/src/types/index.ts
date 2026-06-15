export interface FxRate {
  date: string;
  usd_jpy: number;
  source?: string;
}

export interface FundSummary {
  fund_id: string;
  fund_name: string;
  fund_name_jp?: string;
  strategy?: string;
  manager?: string;
  vintage_year?: number;
  currency?: string;
  commitment_usd: number;
  total_called_usd: number;
  total_called_jpy?: number;
  drawn_pct: number;
  unfunded_usd: number;
  investment_capacity: number;
  net_cash_position: number;
  total_received_usd: number;
  total_received_jpy?: number;
  nav_usd?: number;
  total_value_usd?: number;
  moic?: number;
  tvpi?: number;
  irr?: number | null;
  dpi: number;
  is_active?: boolean;
}

export interface FundDetail extends FundSummary {
  id: string;
  administrator?: string;
  entry_fx_rate?: number;
  contract_date?: string;
  investment_period_start?: string;
  investment_period_end?: string;
  fund_term_years?: number;
  management_fee_pct?: number;
  carry_pct?: number;
  hurdle_rate_pct?: number;
  wire_bank?: string;
  wire_account_name?: string;
  wire_account_number?: string;
  wire_aba?: string;
  wire_swift?: string;
  wire_reference?: string;
  notes?: string;
  summary?: FundSummary;
}

export interface LedgerRow {
  date: string;
  tx_type: 'capital_call' | 'distribution';
  description: string;
  fx_rate?: number;
  capital_paid_in: number;     // B
  capital_received: number;    // C
  reinvestable: number;        // D
  cumulative_called: number;   // E
  investment_capacity: number; // F
  cash_flow: number;           // G
  net_cash_position: number;   // H
  capital_paid_jpy: number;
  capital_received_jpy: number;
  return_of_capital?: number;
  gain?: number;
  interest?: number;
  call_id?: string;
  dist_id?: string;
  wire_reference?: string;
  notes?: string;
}

export interface LedgerSnapshot {
  commitment_usd: number;
  total_called_usd: number;
  total_received_usd: number;
  drawn_pct: number;
  unfunded_usd: number;
  investment_capacity: number;
  net_cash_position: number;
  dpi: number;
}

export interface CapitalCall {
  id: string;
  fund_id: string;
  fund_name?: string;
  notice_date: string;
  due_date: string;
  execution_date?: string;
  call_number?: number;
  call_pct?: number;
  gross_call_usd: number;
  distribution_usd: number;
  reinvestable_usd: number;
  net_call_usd: number;
  fx_rate?: number;
  net_call_jpy: number;
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
  wire_reference?: string;
  notes?: string;
  paid_at?: string;
}

export interface Distribution {
  id: string;
  fund_id: string;
  fund_name?: string;
  distribution_date: string;
  dist_type: string;
  amount_usd: number;
  reinvestable_usd: number;
  fx_rate?: number;
  amount_jpy: number;
  is_recallable: boolean;
  recall_expiry?: string;
  is_recalled: boolean;
  notes?: string;
}

export interface DashboardData {
  total_funds: number;
  total_commitment_usd: number;
  total_called_usd: number;
  total_received_usd: number;
  net_cash_position: number;
  drawn_pct: number;
  unfunded_usd: number;
  dry_powder_usd: number;
  // Performance multiples
  dpi: number;
  tvpi: number;
  moic?: number;
  irr?: number | null;
  total_nav_usd: number;
  total_value_usd?: number;
  pending_calls_count: number;
  overdue_calls_count: number;
  overdue_calls: { id: string; due_date: string; net_call_usd: number }[];
  latest_fx_rate?: number;
  latest_fx_date?: string;
  fund_summaries: FundSummary[];
  strategy_breakdown: { strategy: string; commitment: number; called: number; count: number }[];
  // Distribution breakdown
  distribution_breakdown: {
    capital_return_usd: number;
    income_usd: number;
    recallable_usd: number;
    deemed_usd: number;
    total_usd: number;
  };
  // NAV
  nav_by_fund: { fund_id: string; fund_name: string; nav_date: string; nav_usd: number; period?: string }[];
  // Recent investments
  recent_investments: InvestmentTarget[];
}

export interface InvestmentTarget {
  id: string;
  fund_id: string;
  fund_name?: string;
  project_name: string;
  actual_name?: string;
  investment_date?: string;
  amount_usd: number;
  investment_type?: string;
}

export interface NoticeUpload {
  id: string;
  fund_id?: string;
  fund_name?: string;
  notice_type: 'capital_call' | 'distribution' | 'financial_statement';
  status: 'pending' | 'approved' | 'rejected';
  /** Display name — set by API as originalName ?? filename */
  file_name: string;
  original_name?: string;
  filename?: string;
  extracted_data: ExtractedNoticeData;
  confidence?: number;
  confidence_grade?: 'high' | 'medium' | 'low';
  admin_notes?: string;
  uploaded_by?: string;
  reviewed_at?: string;
  created_at?: string;
  approved_at?: string;
}

export interface ExtractedNoticeData {
  noticeType?:      string;
  confidenceGrade?: 'high' | 'medium' | 'low';
  confidence?:      number;
  fundName?:        string;
  amounts?:         number[];
  dates?:           string[];
  keywords?:        string[];
  // Capital Call
  grossCallUsd?:        number;
  netCallUsd?:          number;
  reinvestableUsd?:     number;
  managementFeeUsd?:    number;
  expenseUsd?:          number;
  investmentAmountUsd?: number;
  callNumber?:          number;
  callPct?:             number;
  dueDate?:             string;
  fxRate?:              number;
  wireReference?:       string;
  // Distribution
  distributionUsd?:   number;
  distributionDate?:  string;
  distributionBreakdown?: {
    capitalReturnUsd?: number;
    incomeUsd?:        number;
    recallableUsd?:    number;
    totalUsd?:         number;
  };
  // NAV / Financial Statement
  navUsd?:  number;
  navDate?: string;
  period?:  string;
  irr?:     number;
  tvpi?:    number;
  dpi?:     number;
  // Investment targets
  investmentTargets?: Array<{
    projectName:     string;
    actualName?:     string;
    amountUsd?:      number;
    investmentType?: string;
    sector?:         string;
    geography?:      string;
    dealType?:       string;
  }>;
  [key: string]: unknown;
}

export interface NavRecord {
  fund_id: string;
  fund_name: string;
  nav_date: string;
  nav_usd: number;
  nav_jpy?: number;
  period?: string;
}
