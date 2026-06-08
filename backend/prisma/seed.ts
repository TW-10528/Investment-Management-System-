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
/// <reference types="node" />
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
  await prisma.fund.create({
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

  // ── Fund — Capula Global Relative Value Trust ─────────────────────────────────
  await prisma.fund.create({
    data: {
      fundName:      'Capula Global Relative Value Trust',
      manager:       'Capula Investment Management LLP',
      administrator: 'Capula Investment Management LLP',
      strategy:      'Global Relative Value',
      vintageYear:   2025,
      currency:      'USD',
      commitmentUsd: 5_000_000,
      isActive:      true,
    },
  })
  console.log('  ✔ Fund created: Capula Global Relative Value Trust')

  console.log('\n✅  Database seeded successfully!')
  console.log('\n   Funds created (ledger empty — upload PDFs via UI to populate)')
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
