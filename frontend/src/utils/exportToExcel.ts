import * as XLSX from 'xlsx';
import type { FundSummary, FundDetail, LedgerRow, DashboardData } from '../types/index';

interface ExportData {
  summary: DashboardData;
  funds: FundSummary[];
  details: Record<string, FundDetail>;
  ledgers: Record<string, LedgerRow[]>;
  rate: number;
}

export async function exportFundsToExcel(data: ExportData) {
  try {
    console.log('🔄 Starting export with data:', {
      funds: data.funds.length,
      details: Object.keys(data.details).length,
      ledgers: Object.keys(data.ledgers).length,
      rate: data.rate
    });

    const wb = XLSX.utils.book_new();

    // Sheet 1: Portfolio Summary
    console.log('📄 Adding Portfolio Summary sheet...');
    addPortfolioSummarySheet(wb, data);

    // Sheet 2: Fund Overview
    console.log('📄 Adding Fund Overview sheet...');
    addFundOverviewSheet(wb, data);

    // Sheet 3: Capital Calls & Distributions
    console.log('📄 Adding Capital Calls & Distributions sheet...');
    addCapitalCallsAndDistributionsSheet(wb, data);

    // Sheet 4: Ledger Summary (aggregated from all funds)
    console.log('📄 Adding Ledger Summary sheet...');
    addLedgerSummarySheet(wb, data);

    // Generate file
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `Fund_Export_${timestamp}.xlsx`;
    console.log('💾 Writing file:', filename);
    XLSX.writeFile(wb, filename);
    console.log('✅ Export completed successfully');
  } catch (error) {
    console.error('❌ Export error:', error);
    throw error;
  }
}

function addPortfolioSummarySheet(wb: XLSX.WorkBook, data: ExportData) {
  const { summary, rate, ledgers } = data;
  const regularFunds = summary.fund_summaries.filter(f => !/sdg/i.test(f.fund_name ?? '') && f.is_active !== false);
  const sdgFund = summary.fund_summaries.find(f => /sdg/i.test(f.fund_name ?? '') && f.is_active !== false);

  const rows: any[] = [
    ['Portfolio Summary', '', ''],
    ['Export Date', new Date().toLocaleDateString(), ''],
    ['Latest FX Rate (USD/JPY)', rate.toFixed(2), ''],
    [],
    ['7 FUNDS (USD)', '', ''],
    ['Metric', 'Value', 'vs Last Month'],
  ];

  // Regular funds totals
  const regularCommit = regularFunds.reduce((sum, f) => sum + (f.commitment_usd ?? 0), 0);
  const regularCalled = regularFunds.reduce((sum, f) => sum + (f.total_called_usd ?? 0), 0);
  const regularDist = regularFunds.reduce((sum, f) => sum + (f.total_received_usd ?? 0), 0);

  // Calculate ROC, Gain, Interest from ledgers
  let regularRoc = 0, regularGain = 0, regularInterest = 0;
  regularFunds.forEach(f => {
    const ledgerRows = ledgers[f.fund_id] ?? [];
    ledgerRows.forEach(row => {
      regularRoc += row.return_of_capital ?? 0;
      regularGain += row.gain ?? 0;
      regularInterest += row.interest ?? 0;
    });
  });

  rows.push(['Total Commitment (USD)', regularCommit, '']);
  rows.push(['Total Called (USD)', regularCalled, '']);
  rows.push(['Total Received (USD)', regularDist, '']);
  rows.push(['Total Return of Capital (USD)', regularRoc, '']);
  rows.push(['Total Gain (USD)', regularGain, '']);
  rows.push(['Total Interest (USD)', regularInterest, '']);

  if (sdgFund) {
    let sdgRoc = 0, sdgGain = 0, sdgInterest = 0;
    const sdgLedgerRows = ledgers[sdgFund.fund_id] ?? [];
    sdgLedgerRows.forEach(row => {
      sdgRoc += row.return_of_capital ?? 0;
      sdgGain += row.gain ?? 0;
      sdgInterest += row.interest ?? 0;
    });

    rows.push([], ['SDG FUND (JPY)', '', '']);
    rows.push(['Metric', 'Value', '']);
    rows.push(['Total Commitment (JPY)', sdgFund.commitment_usd ?? 0, '']);
    rows.push(['Total Called (JPY)', sdgFund.total_called_usd ?? 0, '']);
    rows.push(['Total Received (JPY)', sdgFund.total_received_usd ?? 0, '']);
    rows.push(['Total Return of Capital (JPY)', sdgRoc, '']);
    rows.push(['Total Gain (JPY)', sdgGain, '']);
    rows.push(['Total Interest (JPY)', sdgInterest, '']);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Portfolio Summary');
}

function addFundOverviewSheet(wb: XLSX.WorkBook, data: ExportData) {
  const { summary, details } = data;
  const funds = summary.fund_summaries.filter(f => f.is_active !== false);

  const headers = ['Fund Name', 'Fund Manager', 'Commitment', 'Contribution', 'Distribution', 'NAV', 'TVPI', 'DPI', 'Status'];
  const rows: any[] = [headers];

  for (const fund of funds) {
    const detail = details[fund.fund_id];
    const commitment = detail?.currency === 'JPY'
      ? `¥${Number(fund.contract_commitment_jpy ?? fund.commitment_jpy ?? 0).toLocaleString('ja-JP')}`
      : `$${Number(fund.commitment_usd ?? 0).toLocaleString()}`;

    const nav = detail?.currency === 'JPY'
      ? `¥${Number(fund.nav_usd ?? 0).toLocaleString('ja-JP')}`
      : `$${Number(fund.nav_usd ?? 0).toLocaleString()}`;

    rows.push([
      fund.fund_name,
      fund.manager ?? '—',
      commitment,
      `$${Number(fund.total_called_usd ?? 0).toLocaleString()}`,
      `$${Number(fund.total_received_usd ?? 0).toLocaleString()}`,
      nav,
      `${(fund.tvpi ?? 0).toFixed(2)}×`,
      `${(fund.dpi ?? 0).toFixed(3)}×`,
      fund.is_active !== false ? 'Active' : 'Inactive',
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Fund Overview');
}

function addCapitalCallsAndDistributionsSheet(wb: XLSX.WorkBook, data: ExportData) {
  const { funds, ledgers } = data;

  const headers = ['Fund Name', 'Date', 'Type', 'Amount (USD)', 'FX Rate', 'Notes'];
  const rows: any[] = [headers];

  for (const fund of funds.filter(f => f.is_active !== false)) {
    const ledgerRows = ledgers[fund.fund_id] ?? [];

    for (const row of ledgerRows) {
      if (row.capital_paid_in && row.capital_paid_in > 0) {
        rows.push([
          fund.fund_name,
          row.date,
          'Capital Call',
          row.capital_paid_in.toLocaleString('en-US', { maximumFractionDigits: 2 }),
          row.fx_rate?.toFixed(2) ?? '—',
          row.notes ?? '—',
        ]);
      }

      if (row.capital_received && row.capital_received > 0) {
        rows.push([
          fund.fund_name,
          row.date,
          'Distribution',
          row.capital_received.toLocaleString('en-US', { maximumFractionDigits: 2 }),
          row.fx_rate?.toFixed(2) ?? '—',
          row.notes ?? '—',
        ]);
      }
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 12 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Capital Calls & Distributions');
}

function addLedgerSummarySheet(wb: XLSX.WorkBook, data: ExportData) {
  const { funds, ledgers } = data;

  const headers = ['Fund Name', 'Date', 'Description', 'Capital Called', 'Capital Received', 'Cash Flow', 'Cumulative Called', 'Investment Capacity', 'Net Cash Position'];
  const rows: any[] = [headers];

  for (const fund of funds.filter(f => f.is_active !== false)) {
    const ledgerRows = ledgers[fund.fund_id] ?? [];

    for (const row of ledgerRows) {
      rows.push([
        fund.fund_name,
        row.date,
        row.description,
        row.capital_paid_in?.toLocaleString('en-US', { maximumFractionDigits: 2 }) ?? '—',
        row.capital_received?.toLocaleString('en-US', { maximumFractionDigits: 2 }) ?? '—',
        row.cash_flow?.toLocaleString('en-US', { maximumFractionDigits: 2 }) ?? '—',
        row.cumulative_called?.toLocaleString('en-US', { maximumFractionDigits: 2 }) ?? '—',
        row.investment_capacity?.toLocaleString('en-US', { maximumFractionDigits: 2 }) ?? '—',
        row.net_cash_position?.toLocaleString('en-US', { maximumFractionDigits: 2 }) ?? '—',
      ]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Ledger Summary');
}
