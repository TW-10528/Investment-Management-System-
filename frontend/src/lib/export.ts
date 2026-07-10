import * as XLSX from 'xlsx';

interface FundSummary {
  fund_id: string;
  fund_name: string;
  manager?: string;
  currency?: string;
  commitment_usd?: number;
  total_received_usd?: number;
  return_of_capital_usd?: number;
  gain_usd?: number;
  interest_usd?: number;
  status?: string;
}

interface TransactionRow {
  fund_name?: string;
  manager?: string;
  call_date?: string;
  call_usd?: number;
  dist_date?: string;
  dist_usd?: number;
  [key: string]: any;
}

export function exportFundsToExcel(
  funds: FundSummary[],
  transactions?: TransactionRow[],
  filename: string = 'funds-export.xlsx'
) {
  const workbook = XLSX.utils.book_new();

  // ── Sheet 1: Funds Summary ──
  const fundsSummary = funds.map(f => ({
    'Fund Name': f.fund_name,
    'Manager': f.manager || '—',
    'Currency': f.currency || 'USD',
    'Status': f.status || 'Active',
    'Total Commitment': f.commitment_usd || 0,
    'Total Distributions': f.total_received_usd || 0,
    'Return of Capital': f.return_of_capital_usd || 0,
    'Gain': f.gain_usd || 0,
    'Interest': f.interest_usd || 0,
  }));

  const fundsSummarySheet = XLSX.utils.json_to_sheet(fundsSummary);
  XLSX.utils.book_append_sheet(workbook, fundsSummarySheet, 'Funds Summary');

  // ── Sheet 2: Capital Calls & Distributions ──
  if (transactions && transactions.length > 0) {
    const transactionSheet = XLSX.utils.json_to_sheet(transactions);
    XLSX.utils.book_append_sheet(workbook, transactionSheet, 'Transactions');
  }

  // ── Write File ──
  XLSX.writeFile(workbook, filename);
}

export function exportComparisonToExcel(
  data: any[],
  filename: string = 'fund-comparison-export.xlsx'
) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Comparison');
  XLSX.writeFile(workbook, filename);
}
