/**
 * Prisma seed — Siguler Guff Small Buyout Opportunities Fund VI (F), LP
 *
 * All fund values are sourced from the 4 capital call PDFs in uploads/siguler guff/.
 * Keyword → formula variable mapping follows sigulerGuffParser.ts + fundFormulas.ts.
 *
 * PDF-extracted values:
 *   Call 1 (2026-01-13): $49,000 = 4.90% of commitment  → commitmentUsd = $1,000,000
 *   Call 2 (2026-02-13): $49,000 = 4.90%, cumulative 9.80%
 *   Call 3 (2026-03-16): $50,000 = 5.00%, cumulative 14.80%
 *   Call 4 (2026-04-17): $33,000 = 3.30%, cumulative 18.10%
 *
 * Derived (fundFormulas.ts):
 *   CumulativeContribution = $181,000
 *   DryPowder              = $819,000
 *   CommitmentUtilization  = 18.10%
 *   NetCashFlow            = -$181,000 (no distributions yet)
 *   DPI = 0, TVPI = 0 (no distributions or NAV statement available)
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱  Seeding IMS database with Siguler Guff data…')

  // ── Clear existing data (FK-safe order) ───────────────────────────────────
  await prisma.auditLog.deleteMany()
  await prisma.otpToken.deleteMany()
  await prisma.calculationResult.deleteMany()
  await prisma.calculationRule.deleteMany()
  await prisma.attributeExtractor.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.investmentTarget.deleteMany()
  await prisma.navRecord.deleteMany()
  await prisma.sigfSnapshot.deleteMany()
  await prisma.fundReport.deleteMany()
  await prisma.distribution.deleteMany()
  await prisma.capitalCall.deleteMany()
  await prisma.notice.deleteMany()
  await prisma.fxRate.deleteMany()
  await prisma.fund.deleteMany()
  await prisma.user.deleteMany()
  console.log('  ✔ Cleared existing data')

  // ── Users ─────────────────────────────────────────────────────────────────
  const adminPw = bcrypt.hashSync('Admin123!', 12)
  const staffPw = bcrypt.hashSync('Staff123!', 12)

  await prisma.user.createMany({
    data: [
      {
        email:          'admin@thirdwave.co.jp',
        fullName:       'Admin User',
        fullNameJp:     '管理者',
        hashedPassword: adminPw,
        role:           'admin',
        status:         'active',
        isActive:       true,
      },
      {
        email:          'finance@thirdwave.co.jp',
        fullName:       'Leena Saravanan',
        hashedPassword: staffPw,
        role:           'finance_manager',
        status:         'active',
        isActive:       true,
      },
      {
        email:          'board@thirdwave.co.jp',
        fullName:       'Kenji Tanaka',
        hashedPassword: staffPw,
        role:           'board_member',
        status:         'active',
        isActive:       true,
      },
    ],
  })
  console.log('  ✔ Users created (3)')

  // ── FX Rates (historical + 2026 rates covering capital call dates) ─────────
  await prisma.fxRate.createMany({
    data: [
      { rateDate: new Date('2024-12-31'), usdJpy: 157.15, source: 'MUFG TTM' },
      { rateDate: new Date('2025-01-31'), usdJpy: 155.02, source: 'MUFG TTM' },
      { rateDate: new Date('2025-02-28'), usdJpy: 150.53, source: 'MUFG TTM' },
      { rateDate: new Date('2025-03-31'), usdJpy: 149.85, source: 'MUFG TTM' },
      { rateDate: new Date('2025-04-30'), usdJpy: 143.70, source: 'MUFG TTM' },
      { rateDate: new Date('2025-05-31'), usdJpy: 144.10, source: 'MUFG TTM' },
      { rateDate: new Date('2025-06-30'), usdJpy: 146.30, source: 'MUFG TTM' },
      { rateDate: new Date('2025-07-31'), usdJpy: 148.60, source: 'MUFG TTM' },
      { rateDate: new Date('2025-08-31'), usdJpy: 145.90, source: 'MUFG TTM' },
      { rateDate: new Date('2025-09-30'), usdJpy: 143.20, source: 'MUFG TTM' },
      { rateDate: new Date('2025-10-31'), usdJpy: 152.40, source: 'MUFG TTM' },
      { rateDate: new Date('2025-11-30'), usdJpy: 151.80, source: 'MUFG TTM' },
      { rateDate: new Date('2025-12-31'), usdJpy: 156.50, source: 'MUFG TTM' },
      // 2026 — covering the 4 Siguler Guff capital call settlement months
      { rateDate: new Date('2026-01-31'), usdJpy: 154.20, source: 'MUFG TTM' },
      { rateDate: new Date('2026-02-28'), usdJpy: 150.80, source: 'MUFG TTM' },
      { rateDate: new Date('2026-03-31'), usdJpy: 149.60, source: 'MUFG TTM' },
      { rateDate: new Date('2026-04-30'), usdJpy: 152.30, source: 'MUFG TTM' },
      { rateDate: new Date('2026-05-31'), usdJpy: 153.90, source: 'MUFG TTM' },
    ],
  })
  console.log('  ✔ FX rates created')

  // ── Fund — Siguler Guff (sourced from PDF keyword "Complex Name") ──────────
  // commitmentUsd derived via formula: C = NetCallUsd / CallPct = $49,000 / 0.049
  const sg = await prisma.fund.create({
    data: {
      fundName:            'Siguler Guff Small Buyout Opportunities Fund VI (F), LP',
      fundNameJp:          'シグラー・ガフ スモール・バイアウト・オポチュニティーズ ファンドVI(F)',
      manager:             'Siguler Guff & Company, LP',
      administrator:       'Siguler Guff & Company, LP',
      strategy:            'Small Buyout',
      vintageYear:         2025,
      currency:            'USD',
      // LP commitment = netCallUsd / callPct = $49,000 / 0.049
      commitmentUsd:       1_000_000,
      entryFxRate:         154.20,   // Jan 2026 MUFG TTM rate
      contractDate:        new Date('2025-12-01'),
      wireBank:            'JPMORGAN CHASE BANK, N.A.',
      wireSwift:           'CHASUS33XXX',
      wireAba:             '021000021',
      wireAccountName:     'SIGULER GUFF SMALL BUYOUT OPPORTUNITIES VI F',
      wireAccountNumber:   '515067018',
      wireReference:       '11873-Thirdwave Financial Inc.',
      notes:               'ExtInvestorID: 11873 · FundComplex: 442065 · ClientID: 1541',
      isActive:            true,
    },
  })
  console.log('  ✔ Fund created: Siguler Guff Small Buyout Opportunities Fund VI (F), LP')

  // ── Capital Calls — all 4 extracted from PDF keywords ─────────────────────
  //
  // Formula applied per call:
  //   callPct        ← "capital call equal to X% of commitments"
  //   netCallUsd     ← "share of this capital call is $X"
  //   cumulativePct  ← "funded X% of your commitment"
  //   dueDate        ← "due no later than [Date]"
  //   noticeDate     ← "Send Date: M/D/YYYY"
  //
  // Running balance (fundFormulas.ts §Running Balance Pattern):
  //   Balance(t) = Balance(t-1) - netCallUsd(t)
  //   Balance(0) = $1,000,000
  //   After call 1: $951,000 | call 2: $902,000 | call 3: $852,000 | call 4: $819,000
  await prisma.capitalCall.createMany({
    data: [
      {
        // PDF: 2026-01-13 Capital Call — INITIALCALL, 4.90% of commitments
        // cumulative after this call: 4.90%  |  running balance: $951,000
        fundId:          sg.id,
        callNumber:      1,
        noticeDate:      new Date('2026-01-06'),
        dueDate:         new Date('2026-01-13'),
        grossCallUsd:    49_000,
        netCallUsd:      49_000,
        reinvestableUsd: 0,
        netCallJpy:      Math.round(49_000 * 154.20),
        fxRate:          154.20,
        callPct:         4.90,
        notes:           'Initial call — 4.90% of commitments. Purpose: repay Fund outstanding capital call line. Cumulative: 4.90%',
        status:          'paid',
        paidAt:          new Date('2026-01-13'),
      },
      {
        // PDF: 2026-02-13 Capital Call — 4.90% of commitments, cumulative 9.80%
        // running balance: $902,000
        fundId:          sg.id,
        callNumber:      2,
        noticeDate:      new Date('2026-02-04'),
        dueDate:         new Date('2026-02-13'),
        grossCallUsd:    49_000,
        netCallUsd:      49_000,
        reinvestableUsd: 0,
        netCallJpy:      Math.round(49_000 * 150.80),
        fxRate:          150.80,
        callPct:         4.90,
        notes:           '4.90% of commitments. Purpose: repay Fund outstanding capital call line. Cumulative: 9.80%',
        status:          'paid',
        paidAt:          new Date('2026-02-13'),
      },
      {
        // PDF: 2026-03-16 Capital Call — 5.00% of commitments, cumulative 14.80%
        // running balance: $852,000
        fundId:          sg.id,
        callNumber:      3,
        noticeDate:      new Date('2026-03-05'),
        dueDate:         new Date('2026-03-16'),
        grossCallUsd:    50_000,
        netCallUsd:      50_000,
        reinvestableUsd: 0,
        netCallJpy:      Math.round(50_000 * 149.60),
        fxRate:          149.60,
        callPct:         5.00,
        notes:           '5.00% of commitments. Purpose: repay Fund outstanding capital call line. Cumulative: 14.80%',
        status:          'paid',
        paidAt:          new Date('2026-03-16'),
      },
      {
        // PDF: 2026-04-17 Capital Call — 3.30% of commitments, cumulative 18.10%
        // running balance: $819,000
        fundId:          sg.id,
        callNumber:      4,
        noticeDate:      new Date('2026-04-08'),
        dueDate:         new Date('2026-04-17'),
        grossCallUsd:    33_000,
        netCallUsd:      33_000,
        reinvestableUsd: 0,
        netCallJpy:      Math.round(33_000 * 152.30),
        fxRate:          152.30,
        callPct:         3.30,
        notes:           '3.30% of commitments. Purpose: repay Fund outstanding capital call line. Cumulative: 18.10%',
        status:          'paid',
        paidAt:          new Date('2026-04-17'),
      },
      {
        // PDF: "...2026-05-20 - Capital Call.pdf" — 2.20% of commitments, cumulative 20.30%
        // Batch_ID: 1,448,423 · running balance: $797,000 (= dry powder)
        fundId:          sg.id,
        callNumber:      5,
        noticeDate:      new Date('2026-05-11'),
        dueDate:         new Date('2026-05-20'),
        grossCallUsd:    22_000,
        netCallUsd:      22_000,
        reinvestableUsd: 0,
        netCallJpy:      Math.round(22_000 * 153.90),
        fxRate:          153.90,
        callPct:         2.20,
        notes:           '2.20% of commitments. Purpose: repay Fund outstanding capital call line. Cumulative: 20.30%',
        status:          'paid',
        paidAt:          new Date('2026-05-20'),
      },
    ],
  })
  console.log('  ✔ Capital calls created (5) — all sourced from Siguler Guff PDFs')

  // No distributions yet — fund is early-stage (18.10% drawn, repaying call line)
  // DPI = 0/181,000 = 0.000  (fundFormulas.ts §DPI)

  // ── Fund — Goldman Sachs Vintage X ───────────────────────────────────────────
  await prisma.fund.create({
    data: {
      fundName:      'Vintage X (Flagship) Offshore SCSp',
      manager:       'Goldman Sachs Asset Management',
      administrator: 'Goldman Sachs Asset Management',
      strategy:      'Secondaries',
      vintageYear:   2024,
      currency:      'USD',
      commitmentUsd: 20_000_000,
      entryFxRate:   154.20,
      wireBank:      'State Street Bank & Trust co. Boston',
      wireAba:       '011000028',
      wireAccountName:   'Vintage X (Flagship) Offshore SCSp',
      wireAccountNumber: '11841533',
      wireReference:     'MG149345 Thirdwave Financial Inc.,',
      isActive:      true,
    },
  })
  console.log('  ✔ Fund created: Vintage X (Flagship) Offshore SCSp (Goldman Sachs)')

  // ── Fund — NB Real Estate Secondary Opportunities Offshore Fund II LP ────────
  // Neuberger Berman / NB Alternatives Advisers LLC. Drawdown notices are
  // combined capital call + deemed distribution; commitment from the LP notice.
  await prisma.fund.create({
    data: {
      fundName:      'NB Real Estate Secondary Opportunities Offshore Fund II LP',
      manager:       'NB Alternatives Advisers LLC',
      administrator: 'Neuberger Berman',
      strategy:      'Real Estate Secondaries',
      vintageYear:   2025,
      currency:      'USD',
      commitmentUsd: 5_000_000,
      wireBank:      'Bank of America, N.A.',
      wireAba:       '026-009-593',
      wireSwift:     'BOFAUS3N',
      wireAccountName:   'NB Real Estate Secondary Opportunities Offshore Fund II LP',
      wireAccountNumber: '4451668246',
      wireReference:     'NBI13133',
      isActive:      true,
    },
  })
  console.log('  ✔ Fund created: NB Real Estate Secondary Opportunities Offshore Fund II LP (Neuberger Berman)')

  console.log('\n✅  Database seeded successfully!')
  console.log('\n   Fund:   Siguler Guff Small Buyout Opportunities Fund VI (F), LP')
  console.log('   Commitment:     $1,000,000 USD')
  console.log('   Paid-in:        $203,000  (20.30% drawn — 5 calls from 5 PDFs)')
  console.log('   Dry Powder:     $797,000  (79.70% remaining)')
  console.log('   All 5 calls:    paid')
  console.log('   DPI:            0.000×')
  console.log('\n   Credentials:')
  console.log('   Admin:   admin@thirdwave.co.jp  /  Admin123!')
  console.log('   Finance: finance@thirdwave.co.jp /  Staff123!')
  console.log('   Board:   board@thirdwave.co.jp  /  Staff123!')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
